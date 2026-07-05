"""Tournois asynchrones + saison courante.

Création réservée aux owner/admins de la ligue (dashboard, authentifié).
Inscription/essais identifiés par NOM de joueur, sans auth — cohérent avec
le counter anonyme (même modèle de confiance que POST /games)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_player
from app.models import Player
from app.models.tournament import GOALS
from app.services import players as players_service
from app.services import tournaments as tournaments_service
from app.services.seasons import get_active_season

router = APIRouter(tags=["tournaments"])


class TournamentCreate(BaseModel):
    league_id: uuid.UUID
    title: str = Field(min_length=1, max_length=60)
    mode: str = Field(default="FiftyOne")
    goal: str = Field(default="fewest_darts")
    starts_at: datetime
    ends_at: datetime
    max_tickets: int = Field(default=3, ge=1, le=10)


class NamePayload(BaseModel):
    name: str = Field(min_length=1)


class AttemptSubmit(BaseModel):
    name: str = Field(min_length=1)
    value: int = Field(ge=0)


async def _get_or_404(session: AsyncSession, tournament_id: uuid.UUID):
    t = await tournaments_service.get_tournament(session, tournament_id)
    if t is None:
        raise HTTPException(404, "Tournament not found")
    return t


async def _player_or_404(session: AsyncSession, name: str) -> Player:
    player = await players_service.get_by_name(session, name)
    if player is None:
        raise HTTPException(404, "Player not found")
    return player


@router.get("/seasons/current")
async def current_season(session: AsyncSession = Depends(get_db)) -> dict:
    season = await get_active_season(session)
    if season is None:
        return {"active": False}
    return {
        "active": True,
        "name": season.name,
        "start_date": season.start_date,
        "end_date": season.end_date,
    }


@router.post("/tournaments", status_code=201)
async def create_tournament(
    payload: TournamentCreate,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> dict:
    # Réutilise la matrice de permissions des ligues (owner/admin).
    from app.routers.leagues import _get_league_or_404, _require_role

    league = await _get_league_or_404(session, payload.league_id)
    _require_role(league, player, "admin")
    if payload.goal not in GOALS:
        raise HTTPException(400, f"goal must be one of {GOALS}")
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(400, "ends_at must be after starts_at")
    t = await tournaments_service.create(
        session,
        payload.league_id,
        payload.title,
        payload.mode,
        payload.goal,
        payload.starts_at,
        payload.ends_at,
        player.id,
        payload.max_tickets,
    )
    return tournaments_service.to_dict(t)


@router.get("/tournaments")
async def list_tournaments(
    league_id: uuid.UUID = Query(...),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    rows = await tournaments_service.list_for_league(session, league_id)
    return [tournaments_service.to_dict(t) for t in rows]


@router.get("/tournaments/{tournament_id}")
async def get_tournament(
    tournament_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    return tournaments_service.to_dict(await _get_or_404(session, tournament_id))


@router.post("/tournaments/{tournament_id}/enter")
async def enter_tournament(
    tournament_id: uuid.UUID,
    payload: NamePayload,
    session: AsyncSession = Depends(get_db),
) -> dict:
    t = await _get_or_404(session, tournament_id)
    if tournaments_service.phase_of(t) == "past":
        raise HTTPException(409, "Tournament is over")
    player = await _player_or_404(session, payload.name)
    await tournaments_service.enter(session, t, player)
    return tournaments_service.to_dict(await _get_or_404(session, tournament_id))


@router.post("/tournaments/{tournament_id}/attempts")
async def start_attempt(
    tournament_id: uuid.UUID,
    payload: NamePayload,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Consomme un ticket — définitivement, dès le premier lancer."""
    t = await _get_or_404(session, tournament_id)
    if tournaments_service.phase_of(t) != "live":
        raise HTTPException(409, "Tournament is not live")
    player = await _player_or_404(session, payload.name)
    try:
        entry = await tournaments_service.start_attempt(session, t, player)
    except tournaments_service.NoTicketError:
        raise HTTPException(409, "No tickets left")
    return {"tickets_left": t.max_tickets - entry.tickets_used}


@router.post("/tournaments/{tournament_id}/attempts/submit")
async def submit_attempt(
    tournament_id: uuid.UUID,
    payload: AttemptSubmit,
    session: AsyncSession = Depends(get_db),
) -> dict:
    t = await _get_or_404(session, tournament_id)
    if tournaments_service.phase_of(t) == "upcoming":
        raise HTTPException(409, "Tournament has not started")
    player = await _player_or_404(session, payload.name)
    entry = await tournaments_service.submit_attempt(session, t, player, payload.value)
    if entry is None:
        raise HTTPException(409, "No attempt started for this player")
    return tournaments_service.to_dict(await _get_or_404(session, tournament_id))
