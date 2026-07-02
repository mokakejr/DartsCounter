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
