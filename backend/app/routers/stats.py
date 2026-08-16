import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Season
from app.schemas.stats import PlayerStats
from app.services.achievements import build_trophies, compute_player_stats
from app.services.games import list_all_games_raw
from app.services.seasons import get_active_season
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


@router.get("/achievements")
async def achievements(
    season: str | None = Query(
        default=None,
        description="id d'une saison, 'all' pour tout l'historique, absent = saison en cours",
    ),
    player: str | None = Query(
        default=None,
        description="nom du joueur pour la vue profil (mur) ; absent = vue globale",
    ),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Mur à trophées calculé côté backend (le front ne calcule plus). Même
    sémantique de fenêtre saisonnière que /leaderboard : les stats sont
    calculées sur les seules parties de la saison choisie."""
    since = until_exclusive = None
    if season == "all":
        window: Season | None = None
    elif season is None:
        window = await get_active_season(session)
    else:
        try:
            season_uuid = uuid.UUID(season)
        except ValueError:
            raise HTTPException(422, "season doit être un id de saison ou 'all'")
        window = (
            await session.execute(select(Season).where(Season.id == season_uuid))
        ).scalar_one_or_none()
        if window is None:
            raise HTTPException(404, "Saison inconnue")

    if window is not None and window.start_date is not None:
        since = window.start_date
        if window.end_date is not None:
            until_exclusive = window.end_date + timedelta(days=1)

    games = await list_all_games_raw(session, since=since, until_exclusive=until_exclusive)
    stats = compute_player_stats(games)
    return build_trophies(stats, player_name=player)


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
