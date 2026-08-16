"""Saisons en ressource de premier plan.

`GET /seasons/current` vivait dans le routeur des tournois et n'exposait pas
l'`id` : un client ne pouvait donc filtrer aucune statistique par saison. On
le déplace ici, on ajoute l'id, et on liste toutes les saisons pour alimenter
le sélecteur de période du dashboard.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.schemas.season import SeasonRead
from app.services.seasons import get_active_season, list_seasons

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[SeasonRead])
async def all_seasons(session: AsyncSession = Depends(get_db)) -> list[SeasonRead]:
    return await list_seasons(session)


@router.get("/current", response_model=SeasonRead | None)
async def current_season(session: AsyncSession = Depends(get_db)) -> SeasonRead | None:
    """La saison active, ou null si aucune n'est ouverte. Renvoie désormais un
    objet complet (id compris) plutôt que l'ancien {active, name, …} tronqué."""
    return await get_active_season(session)
