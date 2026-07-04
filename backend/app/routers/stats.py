from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.schemas.stats import PlayerStats
from app.services.stats import get_head_to_head, get_leaderboard, get_modes_meta

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/leaderboard", response_model=list[PlayerStats])
async def leaderboard(
    mode: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
) -> list[PlayerStats]:
    return await get_leaderboard(session, mode)


@router.get("/head-to-head")
async def head_to_head(
    players: str = Query(..., description="Noms séparés par des virgules"),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    names = [n.strip() for n in players.split(",") if n.strip()]
    if len(names) < 2:
        return []
    return await get_head_to_head(session, names[:6])


@router.get("/modes-meta")
async def modes_meta(session: AsyncSession = Depends(get_db)) -> list[dict]:
    return await get_modes_meta(session)
