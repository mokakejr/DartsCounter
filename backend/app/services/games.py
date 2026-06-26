import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import EloHistory, Game, GamePlayer, Player, PlayerRating
from app.models.elo import GLOBAL_SCOPE
from app.schemas.game import GameCreate, GamePlayerRead, GameRead
from app.services.elo import recompute_elo
from app.services.elo_config import get_engine_config, get_score_direction_map
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

    player_ids = [p.id for p in players_by_name.values()]
    existing_ratings = (
        await session.execute(select(PlayerRating).where(PlayerRating.player_id.in_(player_ids)))
    ).scalars().all()
    ratings_by_player_id = {(r.player_id, r.scope): r for r in existing_ratings}

    initial_ratings: dict[str, dict[str, float]] = {}
    initial_games_played: dict[str, dict[str, int]] = {}
    for name, player in players_by_name.items():
        for scope in (GLOBAL_SCOPE, payload.mode):
            row = ratings_by_player_id.get((player.id, scope))
            if row is not None:
                initial_ratings.setdefault(name, {})[scope] = row.rating
                initial_games_played.setdefault(name, {})[scope] = row.games_played

    config = await get_engine_config(session)
    score_direction = await get_score_direction_map(session)
    updates = recompute_elo(
        [{"id": game_id, "mode": payload.mode, "variant": payload.variant, "players": payload.players, "scores": payload.scores}],
        config,
        score_direction,
        initial_ratings=initial_ratings,
        initial_games_played=initial_games_played,
    )
    for u in updates:
        player_id = players_by_name[u.player_name].id
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
        row = ratings_by_player_id.get((player_id, u.scope))
        if row is None:
            row = PlayerRating(player_id=player_id, scope=u.scope, rating=u.elo_after, games_played=1)
            session.add(row)
            ratings_by_player_id[(player_id, u.scope)] = row
        else:
            row.rating = u.elo_after
            row.games_played += 1

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


async def list_all_games_raw(session: AsyncSession) -> list[dict]:
    """All games as plain dicts for the achievement engine, ascending chronological order."""
    rows = (
        await session.execute(select(Game).options(*_EAGER).order_by(Game.date))
    ).scalars().all()
    return [_to_achievement_dict(g) for g in rows]


async def get_display_names(session: AsyncSession, names: list[str]) -> dict[str, str]:
    """Returns {canonical_name: display_name_or_name} for the given player names."""
    if not names:
        return {}
    rows = (
        await session.execute(select(Player).where(Player.name.in_(names)))
    ).scalars().all()
    return {p.name: p.display_name or p.name for p in rows}


def _to_achievement_dict(g: Game) -> dict:
    return {
        "id": str(g.id),
        "date": g.date.isoformat(),
        "mode": g.mode,
        "variant": g.variant,
        "players": [gp.player.name for gp in g.players],
        "winner": g.winner.name if g.winner else None,
        "duration": g.duration or 0,
    }


async def list_games_between(session: AsyncSession, start: datetime, end: datetime) -> list[GameRead]:
    rows = (
        await session.execute(
            select(Game).options(*_EAGER).where(Game.date >= start, Game.date <= end).order_by(Game.date)
        )
    ).scalars().all()
    return [_to_game_read(g) for g in rows]
