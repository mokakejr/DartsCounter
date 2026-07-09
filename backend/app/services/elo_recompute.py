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
from app.models.game import STATUS_COMPLETED
from app.services.elo import GameForElo, recompute_elo
from app.services.elo_config import get_engine_config, get_score_direction_map


async def recompute_all(session: AsyncSession, dry_run: bool = False) -> int:
    """Returns the number of distinct players touched. With dry_run=True,
    computes and returns that count without writing anything.

    Saisons : quand une saison active a un snapshot (season_ratings), le
    replay part de ce snapshot et ne rejoue que les parties de la saison —
    le soft reset survit ainsi aux recomputes (tribunal, admin)."""
    from app.services.seasons import get_active_season, load_season_baseline

    config = await get_engine_config(session)
    score_direction = await get_score_direction_map(session)

    season = await get_active_season(session)
    baseline_by_id: dict = {}
    baseline_games_by_id: dict = {}
    games_query = (
        select(Game.id, Game.mode, Game.variant, Game.raw_data)
        .where(Game.is_casual.is_(False), Game.status == STATUS_COMPLETED)
        .order_by(Game.date)
    )
    if season is not None and season.start_date is not None:
        baseline_by_id, baseline_games_by_id = await load_season_baseline(session, season)
        if baseline_by_id:
            games_query = games_query.where(Game.date >= season.start_date)

    rows = (await session.execute(games_query)).all()
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

    players = (await session.execute(select(Player))).scalars().all()
    player_id_by_name = {p.name: p.id for p in players}
    name_by_id = {p.id: p.name for p in players}

    initial_ratings = {
        name_by_id[pid]: dict(scopes)
        for pid, scopes in baseline_by_id.items()
        if pid in name_by_id
    } or None
    initial_games_played = {
        name_by_id[pid]: dict(scopes)
        for pid, scopes in baseline_games_by_id.items()
        if pid in name_by_id
    } or None

    updates = recompute_elo(
        games, config, score_direction,
        initial_ratings=initial_ratings,
        initial_games_played=initial_games_played,
    )
    player_names = {u.player_name for u in updates}

    if dry_run:
        return len(player_names)

    await session.execute(delete(EloHistory))
    await session.execute(delete(PlayerRating))

    final_state: dict[tuple[uuid.UUID, str], dict] = {}
    for pid, scopes in baseline_by_id.items():
        for scope, rating in scopes.items():
            final_state[(pid, scope)] = {
                "rating": rating,
                "games_played": baseline_games_by_id.get(pid, {}).get(scope, 0),
            }
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
        state = final_state.setdefault(
            key,
            {
                "rating": u.elo_after,
                "games_played": baseline_games_by_id.get(player_id, {}).get(u.scope, 0),
            },
        )
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
