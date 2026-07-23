import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_player
from app.models import Player
from app.models.game import SOLO_MODES, STATUS_COMPLETED, STATUS_PENDING_REVIEW
from app.schemas.game import GameAdjudication, GameCreate, GameRead, GameReport
from app.services import games as games_service
from app.services import tribunal as tribunal_service
from app.services.notifications import dispatch_game_finished

router = APIRouter(tags=["games"])


@router.post("/games", response_model=GameRead, status_code=201)
async def create_game(
    payload: GameCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
) -> GameRead:
    game, created = await games_service.create_game(session, payload)
    if created and game.mode not in SOLO_MODES:
        # Own DB session, not the request's — by the time background tasks
        # run the request's session (Depends(get_db)) has already closed.
        # Les entraînements solo ne déclenchent aucune notification.
        background_tasks.add_task(dispatch_game_finished, game)
    return game


@router.post("/games/{game_id}/report", response_model=GameRead)
async def report_game(
    game_id: uuid.UUID,
    payload: GameReport,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> GameRead:
    """« Un doute sur ce match ? » — freezes a completed game for the league
    tribunal. Elo is recomputed without it until a verdict lands."""
    if payload.reason not in tribunal_service.REPORT_REASONS:
        raise HTTPException(400, f"reason must be one of {tribunal_service.REPORT_REASONS}")
    game = await games_service.get_game(session, game_id)
    if game is None:
        raise HTTPException(404, "Game not found")
    if game.status != STATUS_COMPLETED:
        raise HTTPException(409, f"Game is already {game.status}")
    await tribunal_service.report_game(session, game, player, payload.reason)
    return games_service._to_game_read(game)


@router.post("/games/{game_id}/adjudicate", response_model=GameRead)
async def adjudicate_game(
    game_id: uuid.UUID,
    payload: GameAdjudication,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> GameRead:
    """Tribunal verdict — restricted to league owners/admins sharing a league
    with a participant (or global admins)."""
    if payload.action not in ("validate", "void"):
        raise HTTPException(400, "action must be 'validate' or 'void'")
    game = await games_service.get_game(session, game_id)
    if game is None:
        raise HTTPException(404, "Game not found")
    if game.status != STATUS_PENDING_REVIEW:
        raise HTTPException(409, f"Game is {game.status}, not PENDING_REVIEW")
    if not await tribunal_service.can_adjudicate(session, player, game_id):
        raise HTTPException(403, "Only a league owner/admin of a participant can adjudicate")
    await tribunal_service.adjudicate(session, game, validate=payload.action == "validate")
    return games_service._to_game_read(game)


@router.get("/games", response_model=list[GameRead])
async def list_games(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db),
) -> list[GameRead]:
    return await games_service.list_games(session, limit=limit, offset=offset)
