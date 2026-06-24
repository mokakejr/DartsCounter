from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GamePlayer, Player, PlayerRating
from app.models.elo import GLOBAL_SCOPE
from app.schemas.stats import PlayerStats
from app.services.elo_config import get_engine_config
from app.services.players import image_url


async def get_leaderboard(session: AsyncSession) -> list[PlayerStats]:
    games_subq = (
        select(GamePlayer.player_id, func.count().label("games"))
        .group_by(GamePlayer.player_id)
        .subquery()
    )
    wins_subq = (
        select(GamePlayer.player_id, func.count().label("wins"))
        .where(GamePlayer.position == 1)
        .group_by(GamePlayer.player_id)
        .subquery()
    )

    config = await get_engine_config(session)

    games_col = func.coalesce(games_subq.c.games, 0)
    wins_col = func.coalesce(wins_subq.c.wins, 0)
    elo_col = func.coalesce(PlayerRating.rating, config.starting_rating)

    stmt = (
        select(Player, games_col.label("games"), wins_col.label("wins"), elo_col.label("elo"))
        .outerjoin(games_subq, games_subq.c.player_id == Player.id)
        .outerjoin(wins_subq, wins_subq.c.player_id == Player.id)
        .outerjoin(
            PlayerRating,
            (PlayerRating.player_id == Player.id) & (PlayerRating.scope == GLOBAL_SCOPE),
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
        )
        for r in rows
    ]
