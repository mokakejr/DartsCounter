from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Game, GamePlayer, Player, PlayerRating
from app.models.elo import GLOBAL_SCOPE, modes_in_family
from app.schemas.stats import PlayerStats
from app.services.elo import rank_for_rating
from app.services.elo_config import get_engine_config
from app.services.players import image_url


async def get_leaderboard(session: AsyncSession, mode: str | None = None) -> list[PlayerStats]:
    """`mode=None` is the global leaderboard (games/wins across every mode,
    elo = the "global" scope rating). Passing a mode name scopes all three
    to just that mode — used by the dashboard's per-mode Standings filter."""
    # Always joined to Game (not just when `mode` is passed) so casual games —
    # excluded from Elo but still logged for personal history — never count
    # toward the competitive "games played" used for leaderboard ranking.
    games_query = (
        select(GamePlayer.player_id, func.count().label("games"))
        .join(Game, Game.id == GamePlayer.game_id)
        .where(Game.is_casual.is_(False))
    )
    wins_query = (
        select(GamePlayer.player_id, func.count().label("wins"))
        .join(Game, Game.id == GamePlayer.game_id)
        .where(Game.is_casual.is_(False), GamePlayer.position == 1)
    )
    if mode is not None:
        # A mode filter may be a shared Elo scope name (e.g. "Shanghai") that
        # several literal Game.mode strings feed into — count all of them,
        # not just the exact string, so this matches the shared rating below.
        family_modes = modes_in_family(mode)
        games_query = games_query.where(Game.mode.in_(family_modes))
        wins_query = wins_query.where(Game.mode.in_(family_modes))
    games_subq = games_query.group_by(GamePlayer.player_id).subquery()
    wins_subq = wins_query.group_by(GamePlayer.player_id).subquery()

    config = await get_engine_config(session)
    scope = mode or GLOBAL_SCOPE

    games_col = func.coalesce(games_subq.c.games, 0)
    wins_col = func.coalesce(wins_subq.c.wins, 0)
    elo_col = func.coalesce(PlayerRating.rating, config.starting_rating)

    stmt = (
        select(Player, games_col.label("games"), wins_col.label("wins"), elo_col.label("elo"))
        .outerjoin(games_subq, games_subq.c.player_id == Player.id)
        .outerjoin(wins_subq, wins_subq.c.player_id == Player.id)
        .outerjoin(
            PlayerRating,
            (PlayerRating.player_id == Player.id) & (PlayerRating.scope == scope),
        )
        .order_by(elo_col.desc())
    )
    rows = (await session.execute(stmt)).all()

    return [
        PlayerStats(
            id=r.Player.id,
            name=r.Player.name,
            display_name=r.Player.display_name,
            avatar_url=image_url(r.Player.avatar_path),
            flight_image_url=image_url(r.Player.flight_image_path),
            accent_color=r.Player.accent_color,
            games=r.games,
            wins=r.wins,
            win_rate=round(r.wins / r.games, 3) if r.games else 0.0,
            elo=r.elo,
            rank=rank_for_rating(r.elo, config),
        )
        for r in rows
    ]


async def get_head_to_head(session: AsyncSession, names: list[str]) -> list[dict]:
    """Pairwise duel history + Elo-based win probability for the "Rivalité"
    block on the pre-game screen (Epic 5.2)."""
    from itertools import combinations

    from app.services.games import list_all_games_raw

    config = await get_engine_config(session)
    games = await list_all_games_raw(session)

    ratings = dict(
        (
            await session.execute(
                select(Player.name, PlayerRating.rating)
                .join(PlayerRating, PlayerRating.player_id == Player.id)
                .where(Player.name.in_(names), PlayerRating.scope == GLOBAL_SCOPE)
            )
        ).all()
    )

    pairs = []
    for a, b in combinations(names, 2):
        a_wins = b_wins = 0
        for g in games:
            players = g["players"]
            if a in players and b in players:
                if g["winner"] == a:
                    a_wins += 1
                elif g["winner"] == b:
                    b_wins += 1
        ra = ratings.get(a, config.starting_rating)
        rb = ratings.get(b, config.starting_rating)
        prob = 1 / (1 + 10 ** ((rb - ra) / config.convergence))
        pairs.append({"a": a, "b": b, "a_wins": a_wins, "b_wins": b_wins, "a_win_probability": round(prob, 3)})
    return pairs


async def get_modes_meta(session: AsyncSession) -> list[dict]:
    """Per-mode-family activity stats feeding the mode-card tags (Epic 5.1):
    the front derives 🔥 Tendance (most played over 30 days) and ⏱️ Rapide
    (short average duration) from these numbers."""
    from datetime import datetime, timedelta, timezone

    from app.models.elo import elo_scope_for

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (
        await session.execute(
            select(
                Game.mode,
                func.count().label("games"),
                func.count().filter(Game.date >= cutoff).label("games_30d"),
                func.avg(Game.duration).filter(Game.duration > 0).label("avg_duration"),
            ).group_by(Game.mode)
        )
    ).all()

    families: dict[str, dict] = {}
    for mode, games, games_30d, avg_duration in rows:
        fam = families.setdefault(
            elo_scope_for(mode), {"games": 0, "games_30d": 0, "_durs": []}
        )
        fam["games"] += games
        fam["games_30d"] += games_30d
        if avg_duration:
            fam["_durs"].append(float(avg_duration))
    return [
        {
            "mode": name,
            "games": f["games"],
            "games_30d": f["games_30d"],
            "avg_duration": round(sum(f["_durs"]) / len(f["_durs"])) if f["_durs"] else None,
        }
        for name, f in families.items()
    ]
