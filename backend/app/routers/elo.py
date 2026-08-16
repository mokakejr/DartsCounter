import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_admin
from app.models import Player
from app.models.elo import GLOBAL_SCOPE
from app.schemas.elo import (
    EloSettingsRead,
    EloSettingsUpdate,
    ScoreDirectionCreate,
    ScoreDirectionRead,
    ScoreDirectionUpdate,
)
from app.services import elo_config, elo_query, elo_recompute

router = APIRouter(prefix="/elo", tags=["elo"])


@router.get("/history")
async def multi_elo_history(
    players: str = Query(..., description="Noms séparés par des virgules"),
    scope: str = Query(default=GLOBAL_SCOPE),
    season: uuid.UUID | None = Query(default=None, description="id de saison, absent = tout l'historique"),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Historique Elo de plusieurs joueurs en une requête. Le dashboard faisait
    N GET séquentiels (un par joueur du top) — remplacé par cet appel unique.
    Le nombre de noms est plafonné pour borner la requête."""
    names = [n.strip() for n in players.split(",") if n.strip()]
    if not names:
        return []
    return await elo_query.get_multi_player_elo_history(session, names[:10], scope, season)


@router.get("/settings", response_model=EloSettingsRead)
async def get_settings(session: AsyncSession = Depends(get_db)) -> EloSettingsRead:
    row = await elo_config.get_settings_row(session)
    return EloSettingsRead.model_validate(row)


@router.patch("/settings", response_model=EloSettingsRead)
async def update_settings(
    payload: EloSettingsUpdate,
    _admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> EloSettingsRead:
    try:
        row = await elo_config.update_settings(session, payload.model_dump(exclude_unset=True))
    except elo_config.InvalidSettingsError as exc:
        raise HTTPException(422, str(exc))
    return EloSettingsRead.model_validate(row)


@router.get("/score-directions", response_model=list[ScoreDirectionRead])
async def list_score_directions(session: AsyncSession = Depends(get_db)) -> list[ScoreDirectionRead]:
    rows = await elo_config.list_score_directions(session)
    return [ScoreDirectionRead.model_validate(r) for r in rows]


@router.post("/score-directions", response_model=ScoreDirectionRead, status_code=201)
async def create_score_direction(
    payload: ScoreDirectionCreate,
    _admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> ScoreDirectionRead:
    row = await elo_config.create_score_direction(session, payload.mode, payload.variant, payload.lower_is_better)
    return ScoreDirectionRead.model_validate(row)


@router.patch("/score-directions/{direction_id}", response_model=ScoreDirectionRead)
async def update_score_direction(
    direction_id: uuid.UUID,
    payload: ScoreDirectionUpdate,
    _admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> ScoreDirectionRead:
    row = await elo_config.update_score_direction(session, direction_id, payload.lower_is_better)
    if row is None:
        raise HTTPException(404, "Score direction not found")
    return ScoreDirectionRead.model_validate(row)


@router.delete("/score-directions/{direction_id}", status_code=204)
async def delete_score_direction(
    direction_id: uuid.UUID,
    _admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    deleted = await elo_config.delete_score_direction(session, direction_id)
    if not deleted:
        raise HTTPException(404, "Score direction not found")


@router.post("/recompute")
async def recompute(
    _admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    players_updated = await elo_recompute.recompute_all(session)
    return {"players_updated": players_updated}
