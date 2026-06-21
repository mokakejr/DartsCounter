import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import EloHistory, Game, GamePlayer, Player
from app.schemas.game import GameCreate, GamePlayerRead, GameRead
from app.services.elo import latest_ratings, recompute_elo
from app.services.players import get_or_create_player

_EAGER = (selectinload(Game.players).selectinload(GamePlayer.player), selectinload(Game.winner))


def _to_game_read(game: Game) -> GameRead:
    return GameRead(
        id=game.id,
        date=game.date,
        mode=game.mode,
        variant=game.variant,
        duration=game.duration,
        winner=game.winner.name if game.winner else None,
        players=[
            GamePlayerRead(name=gp.player.name, score=gp.score, position=gp.position)
            for gp in game.players
        ],
    )


async def get_game(session: AsyncSession, game_id: uuid.UUID) -> Game | None:
    return await session.get(Game, game_id, options=_EAGER)


async def create_game(session: AsyncSession, payload: GameCreate) -> tuple[GameRead, bool]:
    """Returns (game, created) — created is False on an idempotent retry hit,
    so callers (e.g. the notification dispatch) don't re-announce a game that
    was already reported once."""
    game_id = payload.id or uuid.uuid4()

    existing = await get_game(session, game_id)
    if existing is not None:
        return _to_game_read(existing), False

    game = Game(
        id=game_id,
        date=payload.date,
        mode=payload.mode,
        variant=payload.variant,
        duration=payload.duration,
        raw_data=payload.model_dump(mode="json"),
    )
    session.add(game)

    cache: dict[str, Player] = {}
    players_by_name: dict[str, Player] = {}
    game_players_read: list[GamePlayerRead] = []
    for name, score in zip(payload.players, payload.scores, strict=True):
        player = await get_or_create_player(session, name, cache)
        players_by_name[name] = player
        is_winner = name == payload.winner
        position = 1 if is_winner else 2
        session.add(
            GamePlayer(
                game_id=game_id,
                player_id=player.id,
                score=score,
                position=position,
            )
        )
        if is_winner:
            game.winner_id = player.id
        game_players_read.append(GamePlayerRead(name=name, score=score, position=position))

    current_ratings = await latest_ratings(session, [p.id for p in players_by_name.values()])
    initial_ratings = {
        name: current_ratings[player.id]
        for name, player in players_by_name.items()
        if player.id in current_ratings
    }

    updates = recompute_elo(
        [{"id": game_id, "players": payload.players, "winner": payload.winner}],
        initial_ratings=initial_ratings,
    )
    for u in updates:
        session.add(
            EloHistory(
                player_id=players_by_name[u.player_name].id,
                game_id=u.game_id,
                elo_before=u.elo_before,
                elo_after=u.elo_after,
                delta=u.delta,
            )
        )

    await session.commit()

    return GameRead(
        id=game_id,
        date=payload.date,
        mode=payload.mode,
        variant=payload.variant,
        duration=payload.duration,
        winner=payload.winner,
        players=game_players_read,
    ), True


async def list_games(session: AsyncSession, limit: int = 50, offset: int = 0) -> list[GameRead]:
    rows = (
        await session.execute(
            select(Game).options(*_EAGER).order_by(Game.date.desc()).limit(limit).offset(offset)
        )
    ).scalars().all()
    return [_to_game_read(g) for g in rows]


async def list_games_between(session: AsyncSession, start: datetime, end: datetime) -> list[GameRead]:
    rows = (
        await session.execute(
            select(Game).options(*_EAGER).where(Game.date >= start, Game.date <= end).order_by(Game.date)
        )
    ).scalars().all()
    return [_to_game_read(g) for g in rows]
