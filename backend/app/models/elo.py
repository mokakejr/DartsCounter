import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.game import Game
    from app.models.player import Player

# The 'global' scope tracks a player's overall rating; every other scope
# value is a game mode string (e.g. "Cricket") tracked independently.
GLOBAL_SCOPE = "global"


class EloHistory(Base):
    """One row per (game, player, scope) — the net rating change from that
    game, after all of its pairwise face-offs are combined. Kept even after
    a full recompute wipes and rebuilds the table, so a player's profile can
    show a timeline of how their rating moved over time."""

    __tablename__ = "elo_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    player_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("players.id"), nullable=False)
    game_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("games.id"), nullable=False)
    scope: Mapped[str] = mapped_column(nullable=False, default=GLOBAL_SCOPE, server_default=GLOBAL_SCOPE)
    elo_before: Mapped[int] = mapped_column(Integer, nullable=False)
    elo_after: Mapped[int] = mapped_column(Integer, nullable=False)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    # The clamped score-vs-average multiplier applied to this player in this
    # game (same value for every scope of theirs in this game) — kept for
    # transparency ("why did my rating move this much").
    perf_multiplier: Mapped[float] = mapped_column(Float, nullable=False, default=1.0, server_default="1.0")
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    player: Mapped["Player"] = relationship(back_populates="elo_history")
    game: Mapped["Game"] = relationship(back_populates="elo_entries")


class PlayerRating(Base):
    """A player's current/live rating for one scope ('global' or a mode
    name) — the thing read on every leaderboard/profile lookup. EloHistory
    is the audit trail; this is the fast-path snapshot, always equal to the
    elo_after of that player+scope's most recent EloHistory row."""

    __tablename__ = "player_ratings"
    __table_args__ = (UniqueConstraint("player_id", "scope", name="uq_player_rating_scope"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    player_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("players.id"), nullable=False)
    scope: Mapped[str] = mapped_column(nullable=False, default=GLOBAL_SCOPE)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    games_played: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    player: Mapped["Player"] = relationship()
