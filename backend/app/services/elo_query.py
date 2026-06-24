"""Read-side queries combining PlayerRating/EloHistory with Player/Game —
used by the players router for a profile's ratings + history display."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EloHistory, Game, PlayerRating
from app.models.elo import GLOBAL_SCOPE
from app.services import elo_config
from app.services.elo import rank_for_rating


async def get_player_ratings(session: AsyncSession, player_id: uuid.UUID) -> list[dict]:
    config = await elo_config.get_engine_config(session)
    rows = (
        await session.execute(select(PlayerRating).where(PlayerRating.player_id == player_id))
    ).scalars().all()
    ordered = sorted(rows, key=lambda r: (r.scope != GLOBAL_SCOPE, r.scope))
    return [
        {
            "scope": r.scope,
            "rating": r.rating,
            "games_played": r.games_played,
            "rank": rank_for_rating(r.rating, config),
        }
        for r in ordered
    ]


async def get_player_elo_history(
    session: AsyncSession, player_id: uuid.UUID, scope: str | None = None
) -> list[dict]:
    stmt = (
        select(EloHistory, Game.date, Game.mode)
        .join(Game, Game.id == EloHistory.game_id)
        .where(EloHistory.player_id == player_id)
        .order_by(Game.date.desc())
    )
    if scope is not None:
        stmt = stmt.where(EloHistory.scope == scope)
    rows = (await session.execute(stmt)).all()
    return [
        {
            "game_id": h.game_id,
            "game_date": date,
            "game_mode": mode,
            "scope": h.scope,
            "elo_before": h.elo_before,
            "elo_after": h.elo_after,
            "delta": h.delta,
            "perf_multiplier": h.perf_multiplier,
            "computed_at": h.computed_at,
        }
        for h, date, mode in rows
    ]
