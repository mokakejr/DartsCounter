import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.schemas.stats import PlayerStats
from app.services.stats import get_leaderboard

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/leaderboard", response_model=list[PlayerStats])
async def leaderboard(
    mode: str | None = Query(default=None),
    league_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
) -> list[PlayerStats]:
    return await get_leaderboard(session, mode, league_id)
