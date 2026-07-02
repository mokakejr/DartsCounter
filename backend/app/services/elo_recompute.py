"""Full Elo rebuild — wipes elo_history + player_ratings and replays every
game in the DB chronologically through the current engine config. Shared by
the migrate_json script and the admin POST /elo/recompute endpoint: both
need the same "start over" operation, since Elo is treated as fully
re-derivable from game history (mode, players, scores), never hand-edited.
"""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EloHistory, Game, Player, PlayerRating
from app.services.elo import GameForElo, recompute_elo
from app.services.elo_config import get_engine_config, get_score_direction_map


async def recompute_all(session: AsyncSession, dry_run: bool = False) -> int:
    """Returns the number of distinct players touched. With dry_run=True,
    computes and returns that count without writing anything."""
    config = await get_engine_config(session)
    score_direction = await get_score_direction_map(session)

    rows = (
        await session.execute(
            select(Game.id, Game.mode, Game.variant, Game.raw_data)
            .where(Game.is_casual.is_(False))
            .order_by(Game.date)
        )
    ).all()
    games: list[GameForElo] = [
        {
            "id": gid,
            "mode": mode,
            "variant": variant,
            "players": raw_data.get("players", []),
            "scores": raw_data.get("scores", []),
        }
        for gid, mode, variant, raw_data in rows
    ]

    updates = recompute_elo(games, config, score_direction)
    player_names = {u.player_name for u in updates}

    if dry_run:
        return len(player_names)

    players = (await session.execute(select(Player))).scalars().all()
    player_id_by_name = {p.name: p.id for p in players}

    await session.execute(delete(EloHistory))
    await session.execute(delete(PlayerRating))

    final_state: dict[tuple[uuid.UUID, str], dict] = {}
    for u in updates:
        player_id = player_id_by_name.get(u.player_name)
        if player_id is None:
            continue
        session.add(
            EloHistory(
                player_id=player_id,
                game_id=u.game_id,
                scope=u.scope,
                elo_before=u.elo_before,
                elo_after=u.elo_after,
                delta=u.delta,
                perf_multiplier=u.perf_multiplier,
            )
        )
        key = (player_id, u.scope)
        state = final_state.setdefault(key, {"rating": u.elo_after, "games_played": 0})
        state["rating"] = u.elo_after
        state["games_played"] += 1

    for (player_id, scope), state in final_state.items():
        session.add(
            PlayerRating(
                player_id=player_id,
                scope=scope,
                rating=state["rating"],
                games_played=state["games_played"],
            )
        )

    await session.commit()
    return len(player_id_by_name)
