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


async def get_player_elo_extremes(
    session: AsyncSession, player_id: uuid.UUID, scope: str = GLOBAL_SCOPE
) -> dict:
    """Best/worst rating and leaderboard rank this player has ever held in
    `scope`, each with the date it happened. Rank isn't stored anywhere — it's
    derived by replaying every EloHistory row for the scope in chronological
    order (grouped by game, since a game's participants all move at once) and
    tracking, at each of the target player's own games, where they stood
    against everyone else's latest rating at that point. Cheap at this app's
    scale (one query, one pass over the scope's history); revisit with a
    stored snapshot if the row count ever makes this slow.
    """
    stmt = (
        select(EloHistory.player_id, EloHistory.elo_after, EloHistory.game_id, Game.date)
        .join(Game, Game.id == EloHistory.game_id)
        .where(EloHistory.scope == scope)
        .order_by(Game.date, Game.id)
    )
    rows = (await session.execute(stmt)).all()

    current_rating: dict[uuid.UUID, int] = {}
    best_elo: int | None = None
    worst_elo: int | None = None
    best_elo_date = None
    worst_elo_date = None
    best_rank: int | None = None
    worst_rank: int | None = None
    best_rank_date = None
    worst_rank_date = None
    best_rank_total: int | None = None
    worst_rank_total: int | None = None

    i, n = 0, len(rows)
    while i < n:
        game_id = rows[i].game_id
        j = i
        while j < n and rows[j].game_id == game_id:
            j += 1
        group = rows[i:j]
        date = group[0].date
        for r in group:
            current_rating[r.player_id] = r.elo_after

        if player_id in {r.player_id for r in group}:
            elo_after = current_rating[player_id]
            if best_elo is None or elo_after > best_elo:
                best_elo, best_elo_date = elo_after, date
            if worst_elo is None or elo_after < worst_elo:
                worst_elo, worst_elo_date = elo_after, date

            standings = sorted(current_rating.items(), key=lambda kv: -kv[1])
            rank = next(idx for idx, (pid, _) in enumerate(standings, start=1) if pid == player_id)
            total = len(current_rating)
            if best_rank is None or rank < best_rank:
                best_rank, best_rank_date, best_rank_total = rank, date, total
            if worst_rank is None or rank > worst_rank:
                worst_rank, worst_rank_date, worst_rank_total = rank, date, total

        i = j

    return {
        "scope": scope,
        "best_elo": best_elo,
        "best_elo_date": best_elo_date,
        "worst_elo": worst_elo,
        "worst_elo_date": worst_elo_date,
        "best_rank": best_rank,
        "best_rank_date": best_rank_date,
        "best_rank_total_players": best_rank_total,
        "worst_rank": worst_rank,
        "worst_rank_date": worst_rank_date,
        "worst_rank_total_players": worst_rank_total,
    }


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
