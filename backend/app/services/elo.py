"""Multiplayer Elo rating.

CLAUDE.md doesn't pin down an exact formula, so this is a deliberately simple,
swappable default: a game is decomposed into (winner, loser) pairs — the
winner is treated as beating every other participant — and a standard 1v1
Elo update is applied per pair. The K-factor is divided by the number of
losers so a free-for-all with many participants doesn't move the winner's
rating further than a 1v1 game would.

Losers are NOT ranked against each other: score semantics differ per game
mode (e.g. lower is better in Cricket Cut Throat), and that per-mode logic
doesn't exist yet (see services/modes/*) — only the `winner` field is
authoritative across all modes.

`recompute_elo` itself is pure (no DB) and unit-testable in isolation;
`latest_ratings` is the DB-backed counterpart used to seed an incremental
update with players' current ratings.
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from typing import TypedDict

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EloHistory, Game

DEFAULT_RATING = 1000
K_FACTOR = 32


class GameForElo(TypedDict):
    id: object  # opaque identifier, passed through to EloUpdate.game_id
    players: list[str]
    winner: str | None


@dataclass(frozen=True)
class EloUpdate:
    game_id: object
    player_name: str
    elo_before: int
    elo_after: int
    delta: int


def _expected_score(rating_a: float, rating_b: float) -> float:
    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))


def recompute_elo(
    games: list[GameForElo], initial_ratings: dict[str, float] | None = None
) -> list[EloUpdate]:
    """Replays `games` in the given order and returns one EloUpdate per
    (game, player) touched. `games` must already be sorted chronologically.

    `initial_ratings` seeds starting ratings (e.g. each player's current
    rating) for an incremental update over a handful of new games; omit it
    for a from-scratch recompute over full history, where everyone starts
    at DEFAULT_RATING.
    """
    ratings: dict[str, float] = dict(initial_ratings) if initial_ratings else {}
    updates: list[EloUpdate] = []

    for game in games:
        players = game["players"]
        winner = game["winner"]
        losers = [p for p in players if p != winner]
        if not winner or not losers or winner not in players:
            continue

        for p in players:
            ratings.setdefault(p, DEFAULT_RATING)

        deltas = dict.fromkeys(players, 0.0)
        k = K_FACTOR / len(losers)
        for loser in losers:
            expected_winner = _expected_score(ratings[winner], ratings[loser])
            change = k * (1 - expected_winner)
            deltas[winner] += change
            deltas[loser] -= change

        for p in players:
            before = ratings[p]
            after = before + deltas[p]
            ratings[p] = after
            updates.append(
                EloUpdate(
                    game_id=game["id"],
                    player_name=p,
                    elo_before=round(before),
                    elo_after=round(after),
                    delta=round(after - before),
                )
            )

    return updates


async def latest_ratings(
    session: AsyncSession, player_ids: Iterable[uuid.UUID] | None = None
) -> dict[uuid.UUID, int]:
    """Each player's elo_after from their most recent game, ordered by the
    game's date (not EloHistory.computed_at — a bulk recompute stamps many
    rows with ~the same timestamp, so computed_at can't tell them apart).
    """
    ranked = select(
        EloHistory.player_id,
        EloHistory.elo_after,
        func.row_number()
        .over(partition_by=EloHistory.player_id, order_by=Game.date.desc())
        .label("rn"),
    ).join(Game, Game.id == EloHistory.game_id)
    if player_ids is not None:
        ranked = ranked.where(EloHistory.player_id.in_(list(player_ids)))
    ranked = ranked.subquery()

    rows = (
        await session.execute(
            select(ranked.c.player_id, ranked.c.elo_after).where(ranked.c.rn == 1)
        )
    ).all()
    return dict(rows)
