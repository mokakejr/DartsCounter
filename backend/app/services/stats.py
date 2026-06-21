from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EloHistory, Game, GamePlayer, Player
from app.schemas.stats import PlayerStats
from app.services.elo import DEFAULT_RATING


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
    elo_ranked = (
        select(
            EloHistory.player_id,
            EloHistory.elo_after,
            func.row_number()
            .over(partition_by=EloHistory.player_id, order_by=Game.date.desc())
            .label("rn"),
        )
        .join(Game, Game.id == EloHistory.game_id)
        .subquery()
    )
    elo_subq = select(elo_ranked.c.player_id, elo_ranked.c.elo_after).where(elo_ranked.c.rn == 1).subquery()

    games_col = func.coalesce(games_subq.c.games, 0)
    wins_col = func.coalesce(wins_subq.c.wins, 0)
    elo_col = func.coalesce(elo_subq.c.elo_after, DEFAULT_RATING)

    stmt = (
        select(Player.id, Player.name, games_col.label("games"), wins_col.label("wins"), elo_col.label("elo"))
        .outerjoin(games_subq, games_subq.c.player_id == Player.id)
        .outerjoin(wins_subq, wins_subq.c.player_id == Player.id)
        .outerjoin(elo_subq, elo_subq.c.player_id == Player.id)
        .order_by(elo_col.desc())
    )
    rows = (await session.execute(stmt)).all()

    return [
        PlayerStats(
            id=r.id,
            name=r.name,
            games=r.games,
            wins=r.wins,
            win_rate=round(r.wins / r.games, 3) if r.games else 0.0,
            elo=r.elo,
        )
        for r in rows
    ]
