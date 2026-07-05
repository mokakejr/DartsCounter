"""Statistical outlier detection (Epics 6.1 / 6.2) + trust factor moves.

A game whose score is absurdly better than the player's recent form gets
frozen (PENDING_REVIEW) before it touches Elo — the league tribunal
(owner/admin) then validates or voids it.
"""

import statistics
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Game, GamePlayer, Player
from app.models.elo import modes_in_family, elo_scope_for
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
    session: AsyncSession, player_id: uuid.UUID, mode: str, limit: int = WINDOW
) -> list[float]:
    stmt = (
        select(GamePlayer.score)
        .join(Game, Game.id == GamePlayer.game_id)
        .where(
            GamePlayer.player_id == player_id,
            Game.mode.in_(modes_in_family(elo_scope_for(mode))),
            Game.is_casual.is_(False),
            Game.status == STATUS_COMPLETED,
        )
        .order_by(Game.date.desc())
        .limit(limit)
    )
    return [float(s) for s in (await session.execute(stmt)).scalars().all()]


async def detect_outlier(
    session: AsyncSession,
    players_by_name: dict[str, Player],
    scores_by_name: dict[str, int],
    mode: str,
    variant: str | None,
    score_direction: dict[tuple[str, str], bool],
) -> bool:
    """True if any player's score in this game is a statistical outlier
    against their own recent history in the same mode family."""
    mode_key = normalize_key(mode)
    variant_key = normalize_key(variant)
    lower_is_better = score_direction.get(
        (mode_key, variant_key), score_direction.get((mode_key, ""), False)
    )
    for name, player in players_by_name.items():
        history = await recent_scores(session, player.id, mode)
        if is_outlier(float(scores_by_name[name]), history, lower_is_better):
            return True
    return False
