import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Season
from app.schemas.stats import PlayerStats
from app.services.stats import get_head_to_head, get_leaderboard, get_modes_meta

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/leaderboard", response_model=list[PlayerStats])
async def leaderboard(
    mode: str | None = Query(default=None),
    league_id: uuid.UUID | None = Query(default=None),
    season: str | None = Query(
        default=None,
        description="id d'une saison, 'all' pour tout l'historique, absent = saison en cours",
    ),
    session: AsyncSession = Depends(get_db),
) -> list[PlayerStats]:
    # 'all' et absent passent tels quels au service ; un id est résolu en objet.
    resolved: Season | str | None = season
    if season not in (None, "all"):
        try:
            season_uuid = uuid.UUID(season)
        except ValueError:
            raise HTTPException(422, "season doit être un id de saison ou 'all'")
        resolved = (
            await session.execute(select(Season).where(Season.id == season_uuid))
        ).scalar_one_or_none()
        if resolved is None:
            raise HTTPException(404, "Saison inconnue")
    return await get_leaderboard(session, mode, league_id, season=resolved)


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
