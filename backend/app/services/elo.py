"""Multiplayer Elo rating engine.

Ported from scripts/elo-calculator.py's pairwise round-robin design, plus a
performance multiplier on top: every pair of participants in a game faces
off directly by score (see `_beats`, which also handles a draw when two
players tie), with a per-player, per-scope K-factor that decays as that
player accumulates games. Two scopes are computed per game: "global"
(every game) and the game's own mode (e.g. "Cricket") — see GLOBAL_SCOPE.

All functions here are pure (no DB) and config-driven (an `EloConfig`
instance, not env vars or hardcoded constants) so the whole system is
re-tunable from app/services/elo_config.py without touching this module.
"""

import statistics
from dataclasses import dataclass
from typing import TypedDict

from app.models.elo import GLOBAL_SCOPE

RANK_TIERS = ("Silver", "Gold", "Platinum", "Diamond")


@dataclass(frozen=True)
class EloConfig:
    starting_rating: float = 10000.0
    convergence: float = 4000.0
    k_factors: tuple[float, ...] = (800.0, 400.0, 300.0, 200.0)
    k_thresholds: tuple[int, ...] = (5, 10, 15)
    perf_multiplier_min: float = 0.5
    perf_multiplier_max: float = 2.0
    bronze_ceiling: float = 9000.0
    rank_tier_value: float = 1200.0
    champion_multiplier: float = 2.5


class GameForElo(TypedDict):
    id: object  # opaque identifier, passed through to EloUpdate.game_id
    mode: str
    variant: str | None
    players: list[str]
    scores: list[int]


def normalize_key(value: str | None) -> str:
    """Case/space/punctuation-insensitive key so 'Cut Throat' and
    'CutThroat' (both seen across older data) match the same row. Mirrors
    app/models/elo_config.py's normalization (kept separate to avoid a
    services -> models -> services import cycle)."""
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())


@dataclass(frozen=True)
class EloUpdate:
    game_id: object
    player_name: str
    scope: str
    elo_before: int
    elo_after: int
    delta: int
    perf_multiplier: float


@dataclass
class _PlayerState:
    rating: float
    games_played: int


def expected_score(rating_a: float, rating_b: float, convergence: float) -> float:
    return 1 / (1 + 10 ** ((rating_b - rating_a) / convergence))


def get_k_factor(games_played: int, k_factors: tuple[float, ...], k_thresholds: tuple[int, ...]) -> float:
    """k_factors[i] applies while games_played < k_thresholds[i]; the last
    k_factors entry applies once games_played reaches the last threshold."""
    for i, threshold in enumerate(k_thresholds):
        if games_played < threshold:
            return k_factors[i]
    return k_factors[-1]


def performance_multiplier(
    player_score: float, scores: list[float], lower_is_better: bool, clamp_min: float, clamp_max: float
) -> float:
    """How dominant a player's result was, relative to the game's average
    score — clamped so one blowout (or one disastrous game) can't swing a
    rating further than `clamp_max`/`clamp_min` would allow.

    Guards both halves of the division: an average of 0 (everyone scored 0)
    is treated as neutral (1.0, no signal); a player's own score of 0 in a
    lower-is-better game (the best possible outcome there) is treated as
    maximally dominant, clamped to `clamp_max`.
    """
    avg = statistics.fmean(scores) if scores else 0
    if lower_is_better:
        ratio = (avg / player_score) if player_score else clamp_max
    else:
        ratio = (player_score / avg) if avg else 1.0
    return min(clamp_max, max(clamp_min, ratio))


def _beats(score_a: float, score_b: float, lower_is_better: bool) -> bool | None:
    """True if a beats b, False if b beats a, None if it's a draw (equal
    scores) — Shanghai explicitly allows ties, so this has to be a real
    third outcome, not just an arbitrary tie-break order."""
    if score_a == score_b:
        return None
    return (score_a > score_b) if not lower_is_better else (score_a < score_b)


def recompute_elo(
    games: list[GameForElo],
    config: EloConfig,
    score_direction: dict[tuple[str, str], bool] | None = None,
    initial_ratings: dict[str, dict[str, float]] | None = None,
    initial_games_played: dict[str, dict[str, int]] | None = None,
) -> list[EloUpdate]:
    """Replays `games` (already sorted chronologically) and returns one
    EloUpdate per (game, player, scope) touched — two scopes per player per
    game: "global" and the game's own mode.

    `initial_ratings`/`initial_games_played` (player_name -> scope -> value)
    seed an incremental update over a handful of new games (e.g. one new
    game just played); omit both for a from-scratch recompute over full
    history, where everyone starts at config.starting_rating with 0 games.

    `score_direction` maps a normalized (mode, variant) key to whether
    lower score wins for that combo (see app/models/elo_config.py's
    normalization) — anything not present defaults to higher-is-better.
    Pass an empty/None dict if every game here has no variant-specific
    direction override.
    """
    score_direction = score_direction or {}
    states: dict[str, dict[str, _PlayerState]] = {}

    def state_for(player: str, scope: str) -> _PlayerState:
        scopes = states.setdefault(player, {})
        if scope not in scopes:
            rating = (initial_ratings or {}).get(player, {}).get(scope, config.starting_rating)
            games_played = (initial_games_played or {}).get(player, {}).get(scope, 0)
            scopes[scope] = _PlayerState(rating=rating, games_played=games_played)
        return scopes[scope]

    updates: list[EloUpdate] = []

    for game in games:
        players = game["players"]
        scores = game["scores"]
        n = len(players)
        if n < 2:
            continue

        mode = game["mode"]
        mode_key = normalize_key(mode)
        variant_key = normalize_key(game.get("variant"))
        lower_is_better = score_direction.get(
            (mode_key, variant_key), score_direction.get((mode_key, ""), False)
        )

        score_by_player = dict(zip(players, scores, strict=True))
        perf = {
            p: performance_multiplier(
                score_by_player[p], scores, lower_is_better, config.perf_multiplier_min, config.perf_multiplier_max
            )
            for p in players
        }

        for scope in (GLOBAL_SCOPE, mode):
            before = {p: state_for(p, scope).rating for p in players}
            k = {p: get_k_factor(state_for(p, scope).games_played, config.k_factors, config.k_thresholds) for p in players}
            deltas = dict.fromkeys(players, 0.0)

            for i in range(n):
                for j in range(i + 1, n):
                    a, b = players[i], players[j]
                    outcome = _beats(score_by_player[a], score_by_player[b], lower_is_better)
                    expected_a = expected_score(before[a], before[b], config.convergence)
                    actual_a = 0.5 if outcome is None else (1.0 if outcome else 0.0)
                    deltas[a] += k[a] * (actual_a - expected_a) / (n - 1)
                    deltas[b] += k[b] * ((1 - actual_a) - (1 - expected_a)) / (n - 1)

            for p in players:
                st = state_for(p, scope)
                change = deltas[p] * perf[p]
                after = st.rating + change
                updates.append(
                    EloUpdate(
                        game_id=game["id"],
                        player_name=p,
                        scope=scope,
                        elo_before=round(st.rating),
                        elo_after=round(after),
                        delta=round(after - st.rating),
                        perf_multiplier=perf[p],
                    )
                )
                st.rating = after
                st.games_played += 1

    return updates


def rank_tier_boundaries(config: EloConfig) -> list[tuple[str, float, float]]:
    """[(tier_name, lower_bound_inclusive, upper_bound_exclusive), ...] in
    ascending order, Bronze through Grand Champion. Grand Champion's upper
    bound is float('inf') — there's nothing above it."""
    bounds: list[tuple[str, float, float]] = [("Bronze", float("-inf"), config.bronze_ceiling)]
    third = config.rank_tier_value / 3
    start = config.bronze_ceiling
    for tier in RANK_TIERS:
        for i, sub in enumerate(("I", "II", "III")):
            bounds.append((f"{tier} {sub}", start + i * third, start + (i + 1) * third))
        start += config.rank_tier_value
    champion_span = config.champion_multiplier * config.rank_tier_value
    bounds.append(("Champion", start, start + champion_span))
    start += champion_span
    bounds.append(("Grand Champion", start, float("inf")))
    return bounds


def rank_for_rating(rating: float, config: EloConfig) -> str:
    for name, lo, hi in rank_tier_boundaries(config):
        if lo <= rating < hi:
            return name
    return "Grand Champion"
