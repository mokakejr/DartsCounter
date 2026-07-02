import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_player
from app.models import League, Player
from app.schemas.league import LeagueCreate, LeagueJoin, LeagueRead, LeagueUpdate, MemberAdd
from app.services import leagues as leagues_service
from app.services import players as players_service

router = APIRouter(prefix="/leagues", tags=["leagues"])


async def _get_league_or_404(session: AsyncSession, league_id: uuid.UUID) -> League:
    league = await leagues_service.get_league(session, league_id)
    if league is None:
        raise HTTPException(404, "League not found")
    return league


def _require_owner(league: League, player: Player) -> None:
    if league.owner_id != player.id:
        raise HTTPException(403, "Only the league owner can do this")


@router.post("", response_model=LeagueRead, status_code=201)
async def create_league(
    payload: LeagueCreate,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await leagues_service.create(session, player, payload.name)
    return leagues_service.league_to_read(league)


@router.get("/mine", response_model=list[LeagueRead])
async def my_leagues(
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> list[LeagueRead]:
    rows = await leagues_service.list_mine(session, player.id)
    return [leagues_service.league_to_read(league) for league in rows]


@router.post("/join", response_model=LeagueRead)
async def join_league(
    payload: LeagueJoin,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await leagues_service.get_by_code(session, payload.code)
    if league is None:
        raise HTTPException(404, "Unknown invite code")
    league = await leagues_service.join(session, league, player)
    return leagues_service.league_to_read(league)


@router.patch("/{league_id}", response_model=LeagueRead)
async def rename_league(
    league_id: uuid.UUID,
    payload: LeagueUpdate,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await _get_league_or_404(session, league_id)
    _require_owner(league, player)
    league = await leagues_service.rename(session, league, payload.name)
    return leagues_service.league_to_read(league)


@router.delete("/{league_id}", status_code=204)
async def delete_league(
    league_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> None:
    league = await _get_league_or_404(session, league_id)
    _require_owner(league, player)
    await leagues_service.delete(session, league)


@router.post("/{league_id}/members", response_model=LeagueRead)
async def add_member(
    league_id: uuid.UUID,
    payload: MemberAdd,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await _get_league_or_404(session, league_id)
    _require_owner(league, player)
    member = await players_service.get_by_name(session, payload.name)
    if member is None:
        raise HTTPException(404, "Player not found")
    league = await leagues_service.add_member(session, league, member)
    return leagues_service.league_to_read(league)


@router.delete("/{league_id}/members/{player_id}", status_code=204)
async def remove_member(
    league_id: uuid.UUID,
    player_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> None:
    league = await _get_league_or_404(session, league_id)
    if player_id != player.id:
        _require_owner(league, player)
    if player_id == league.owner_id:
        raise HTTPException(400, "The owner can't leave — delete the league instead")
    await leagues_service.remove_member(session, league, player_id)
