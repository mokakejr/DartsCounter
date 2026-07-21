"""DB-backed loading/editing of the Elo engine's tunable config — see
app/models/elo_config.py for the schema and app/services/elo.py for the
pure engine that consumes the resulting EloConfig."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.elo_config import SETTINGS_ID, EloSettings, ScoreDirection, normalize_key
from app.services.elo import EloConfig


async def get_settings_row(session: AsyncSession) -> EloSettings:
    """The settings row is seeded by its migration, but fall back to
    creating it on the fly so a fresh/test DB never 404s on first read."""
    row = await session.get(EloSettings, SETTINGS_ID)
    if row is None:
        row = EloSettings(id=SETTINGS_ID)
        session.add(row)
        await session.commit()
    return row


async def get_engine_config(session: AsyncSession) -> EloConfig:
    row = await get_settings_row(session)
    return EloConfig(
        starting_rating=row.starting_rating,
        convergence=row.convergence,
        k_factors=tuple(row.k_factors),
        k_thresholds=tuple(row.k_thresholds),
        perf_multiplier_min=row.perf_multiplier_min,
        perf_multiplier_max=row.perf_multiplier_max,
        bronze_ceiling=row.bronze_ceiling,
        rank_tier_value=row.rank_tier_value,
        champion_multiplier=row.champion_multiplier,
    )


class InvalidSettingsError(Exception):
    pass


async def update_settings(session: AsyncSession, updates: dict) -> EloSettings:
    """`updates` should come from `payload.model_dump(exclude_unset=True)`.

    EloSettingsUpdate's own validator only checks k_factors/k_thresholds
    consistency when both are submitted together in the same request — a
    PATCH touching only one of them could otherwise leave the *stored* pair
    mismatched. Re-check the merged result here, after applying updates but
    before committing.
    """
    row = await get_settings_row(session)
    for key, value in updates.items():
        setattr(row, key, value)
    if len(row.k_thresholds) != len(row.k_factors) - 1:
        await session.rollback()
        raise InvalidSettingsError("k_thresholds must have exactly one fewer entry than k_factors")
    await session.commit()
    # updated_at est régénéré côté serveur (onupdate=func.now()) : l'attribut
    # est expiré après l'UPDATE et sa lecture hors contexte async planterait
    # (MissingGreenlet) — on le recharge explicitement.
    await session.refresh(row)
    return row


async def list_score_directions(session: AsyncSession) -> list[ScoreDirection]:
    rows = (await session.execute(select(ScoreDirection).order_by(ScoreDirection.mode, ScoreDirection.variant))).scalars().all()
    return list(rows)


async def create_score_direction(
    session: AsyncSession, mode: str, variant: str | None, lower_is_better: bool
) -> ScoreDirection:
    row = ScoreDirection(mode=mode, variant=variant, lower_is_better=lower_is_better)
    session.add(row)
    await session.commit()
    return row


async def update_score_direction(session: AsyncSession, direction_id: uuid.UUID, lower_is_better: bool) -> ScoreDirection | None:
    row = await session.get(ScoreDirection, direction_id)
    if row is None:
        return None
    row.lower_is_better = lower_is_better
    await session.commit()
    return row


async def delete_score_direction(session: AsyncSession, direction_id: uuid.UUID) -> bool:
    row = await session.get(ScoreDirection, direction_id)
    if row is None:
        return False
    await session.delete(row)
    await session.commit()
    return True


async def get_score_direction_map(session: AsyncSession) -> dict[tuple[str, str], bool]:
    """(normalized_mode, normalized_variant) -> lower_is_better, for
    app.services.elo.recompute_elo's `score_direction` argument. A
    variant=NULL row becomes the ("", "") -> ... fallback for every variant
    of that mode."""
    rows = await list_score_directions(session)
    return {(row.mode_key, row.variant_key): row.lower_is_better for row in rows}
