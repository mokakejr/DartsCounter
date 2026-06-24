import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Single-row table (id is always 1) — every tunable knob for the rating
# engine in one place, editable through the admin-only /elo/settings
# endpoint without a redeploy. Seeded by the migration that creates it.
SETTINGS_ID = 1


class EloSettings(Base):
    __tablename__ = "elo_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=SETTINGS_ID)

    starting_rating: Mapped[float] = mapped_column(Float, nullable=False, default=10000.0)
    # The "400" in the standard Elo expected-score formula, renamed since
    # this system runs on a 10000-point scale rather than 1000.
    convergence: Mapped[float] = mapped_column(Float, nullable=False, default=4000.0)

    # K-factor schedule: k_factors[i] applies while a player's games-played
    # (in the relevant scope) is below k_thresholds[i]; the last k_factors
    # entry applies once games-played reaches/exceeds the last threshold.
    # len(k_thresholds) must be len(k_factors) - 1.
    k_factors: Mapped[list[float]] = mapped_column(JSONB, nullable=False, default=lambda: [800.0, 400.0, 300.0, 200.0])
    k_thresholds: Mapped[list[int]] = mapped_column(JSONB, nullable=False, default=lambda: [5, 10, 15])

    # Performance multiplier clamp — see app/services/elo.py:performance_multiplier.
    perf_multiplier_min: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    perf_multiplier_max: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)

    # Rank ladder. Bronze is anything below bronze_ceiling. Silver/Gold/
    # Platinum/Diamond each span rank_tier_value points, split into 3 equal
    # sub-ranks. Champion spans champion_multiplier * rank_tier_value points
    # (no sub-ranks). Grand Champion starts where Champion ends and has no
    # ceiling.
    bronze_ceiling: Mapped[float] = mapped_column(Float, nullable=False, default=9000.0)
    rank_tier_value: Mapped[float] = mapped_column(Float, nullable=False, default=1200.0)
    champion_multiplier: Mapped[float] = mapped_column(Float, nullable=False, default=2.5)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


def normalize_key(value: str | None) -> str:
    """Case/space/punctuation-insensitive key so 'Cut Throat' and
    'CutThroat' (both seen across older data) match the same row."""
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())


class ScoreDirection(Base):
    """Admin-editable lookup: which (mode, variant) combos are "lower score
    wins" (e.g. Cricket Cut Throat) for the performance multiplier and
    pairwise ranking. variant=NULL applies to every variant of that mode.
    Anything not found here defaults to higher-is-better.
    """

    __tablename__ = "score_directions"
    __table_args__ = (UniqueConstraint("mode_key", "variant_key", name="uq_score_direction"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mode: Mapped[str] = mapped_column(nullable=False)
    variant: Mapped[str | None] = mapped_column(nullable=True)
    mode_key: Mapped[str] = mapped_column(nullable=False)
    variant_key: Mapped[str] = mapped_column(nullable=False, default="")
    lower_is_better: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __init__(self, **kwargs):
        if "mode" in kwargs:
            kwargs.setdefault("mode_key", normalize_key(kwargs["mode"]))
        if "variant" in kwargs:
            kwargs.setdefault("variant_key", normalize_key(kwargs.get("variant")))
        super().__init__(**kwargs)
