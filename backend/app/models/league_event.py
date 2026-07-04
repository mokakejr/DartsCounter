import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.player import Player

# Feed event types (Epic 9.1). REMONTADA needs in-game deficit data the
# counter doesn't record yet — the enum slot is reserved.
EVENT_USURPATION = "USURPATION"
EVENT_CLEAN_SWEEP = "CLEAN_SWEEP"
EVENT_STREAK_BROKEN = "STREAK_BROKEN"
EVENT_PHENIX = "PHENIX"
EVENT_REMONTADA = "REMONTADA"

# Pantheon pillars (Epic 9.3). "_REGNE_CURRENT" is internal bookkeeping for
# the running reign counter; only the four public pillars are exposed.
PILLAR_REGNE = "REGNE"
PILLAR_TUEUR = "TUEUR_A_GAGES"
PILLAR_STAKHANOVISTE = "STAKHANOVISTE"
PILLAR_REMONTADA = "REMONTADA"
PILLAR_REGNE_CURRENT = "_REGNE_CURRENT"
PUBLIC_PILLARS = (PILLAR_REGNE, PILLAR_TUEUR, PILLAR_STAKHANOVISTE, PILLAR_REMONTADA)


class LeagueEvent(Base):
    """Social feed entries — written asynchronously after a game, purged
    after 30 days (Pantheon records live in league_pantheon, no TTL)."""

    __tablename__ = "league_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    league_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leagues.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False
    )
    target_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=True
    )
    story_text: Mapped[str] = mapped_column(Text, nullable=False)
    respect_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    actor: Mapped["Player"] = relationship(foreign_keys=[actor_id])
    target: Mapped["Player | None"] = relationship(foreign_keys=[target_id])


class LeaguePantheon(Base):
    """Immutable hall-of-fame records, one row per (league, pillar)."""

    __tablename__ = "league_pantheon"

    league_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leagues.id", ondelete="CASCADE"), primary_key=True
    )
    pillar: Mapped[str] = mapped_column(Text, primary_key=True)
    holder_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=False
    )
    value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    achieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    holder: Mapped["Player"] = relationship()
