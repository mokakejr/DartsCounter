from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.schemas.game import GameCreate, GameRead
from app.services import games as games_service
from app.services.notifications import dispatch_game_finished

router = APIRouter(tags=["games"])


@router.post("/games", response_model=GameRead, status_code=201)
async def create_game(
    payload: GameCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
) -> GameRead:
    game, created = await games_service.create_game(session, payload)
    if created:
        # Own DB session, not the request's — by the time background tasks
        # run the request's session (Depends(get_db)) has already closed.
        background_tasks.add_task(dispatch_game_finished, game)
    return game


@router.get("/games", response_model=list[GameRead])
async def list_games(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db),
) -> list[GameRead]:
    return await games_service.list_games(session, limit=limit, offset=offset)
