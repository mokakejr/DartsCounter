"""Statistical outlier detection (Epics 6.1 / 6.2) + trust factor moves.

A game whose score is absurdly better than the player's recent form gets
frozen (PENDING_REVIEW) before it touches Elo — the league tribunal
(owner/admin) then validates or voids it.
"""

import statistics
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Game, GamePlayer, Player
from app.models.game import STATUS_COMPLETED
from app.services.elo import normalize_key

# ponytail: rolling window = last 20 games (spec 6.2), not the 5-business-day
# SQL of spec 7.2 — robust at office volumes, no calendar edge cases.
WINDOW = 20
MIN_SAMPLE = 8  # below this, no judgement — new players get calibration slack
Z_THRESHOLD = 3.0

TRUST_MIN, TRUST_MAX = 0, 100
TRUST_GAME_COMPLETED = +2
TRUST_REPORTED = -15
TRUST_VOIDED = -30
TRUST_CLEARED = +10  # wrongly accused, tribunal validated


def bump_trust(player: Player, delta: int) -> None:
    player.trust_factor = max(TRUST_MIN, min(TRUST_MAX, (player.trust_factor or 50) + delta))


def is_outlier(score: float, history: list[float], lower_is_better: bool = False) -> bool:
    """Z-score of `score` against `history`, flagged only when the deviation
    is in the *better* direction (a slump is never suspicious)."""
    if len(history) < MIN_SAMPLE:
        return False
    mu = statistics.fmean(history)
    sigma = statistics.pstdev(history)
    if sigma == 0:
        return False
    z = (score - mu) / sigma
    if lower_is_better:
        z = -z
    return z > Z_THRESHOLD


async def recent_scores(
    session: AsyncSession,
    player_id: uuid.UUID,
    mode: str,
    variant: str | None,
    exclude_game_id: uuid.UUID | None = None,
    limit: int = WINDOW,
) -> list[float]:
    """History window. `exclude_game_id` MUST name the game under scrutiny:
    it is already flushed to the session when this runs, and an outlier
    inside its own sample caps the reachable z-score at (n-1)/sqrt(n) —
    below the 3.0 threshold for any window under 11 games.

    Only the exact same ruleset (literal mode + variant) is comparable on
    absolute score: the Shanghai Elo family shares one rating scope but not
    one scale (classic targets 1-7 ≈ 40-80 pts, Random/Crazy targets drawn
    from 1-20+bull ≈ 3x that), and Cricket variants even flip direction
    (Cut Throat is lower-is-better). Pooling them froze perfectly normal
    games as "aberrant"."""
    # Same normalization as normalize_key ('Cut Throat' == 'CutThroat'),
    # done in SQL so the LIMIT applies to matching games only.
    variant_key_sql = func.regexp_replace(
        func.lower(func.coalesce(Game.variant, "")), "[^a-z0-9]", "", "g"
    )
    stmt = (
        select(GamePlayer.score)
        .join(Game, Game.id == GamePlayer.game_id)
        .where(
            GamePlayer.player_id == player_id,
            Game.mode == mode,
            variant_key_sql == normalize_key(variant),
            Game.is_casual.is_(False),
            Game.status == STATUS_COMPLETED,
        )
        .order_by(Game.date.desc())
        .limit(limit)
    )
    if exclude_game_id is not None:
        stmt = stmt.where(Game.id != exclude_game_id)
    return [float(s) for s in (await session.execute(stmt)).scalars().all()]


async def detect_outlier(
    session: AsyncSession,
    players_by_name: dict[str, Player],
    scores_by_name: dict[str, int],
    mode: str,
    variant: str | None,
    score_direction: dict[tuple[str, str], bool],
    game_id: uuid.UUID | None = None,
) -> bool:
    """True if any player's score in this game is a statistical outlier
    against their own recent history in the same mode + variant."""
    mode_key = normalize_key(mode)
    variant_key = normalize_key(variant)
    lower_is_better = score_direction.get(
        (mode_key, variant_key), score_direction.get((mode_key, ""), False)
    )
    for name, player in players_by_name.items():
        history = await recent_scores(session, player.id, mode, variant, exclude_game_id=game_id)
        if is_outlier(float(scores_by_name[name]), history, lower_is_better):
            return True
    return False
