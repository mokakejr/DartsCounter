import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.player import Player

# Objectifs de score-attack. fewest_darts : plus petit = meilleur (Sprint 51).
# max_points : plus grand = meilleur (réservé au Survival Cricket à venir).
GOAL_FEWEST_DARTS = "fewest_darts"
GOAL_MAX_POINTS = "max_points"
GOALS = (GOAL_FEWEST_DARTS, GOAL_MAX_POINTS)


class Tournament(Base):
    """Tournoi asynchrone « score attack » (Hub v2 / Epic 2.5) : tous les
    membres s'affrontent sur une épreuve commune, chacun de son côté,
    pendant une fenêtre de temps. 3 tickets, seul le meilleur essai compte,
    égalité stricte = premier soumis gagnant."""

    __tablename__ = "tournaments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    league_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leagues.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[str] = mapped_column(Text, nullable=False)  # 'FiftyOne' (v1)
    goal: Mapped[str] = mapped_column(Text, nullable=False, default=GOAL_FEWEST_DARTS)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_tickets: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Flags des jobs (rappel 6h avant la fin, annonce du podium à la clôture)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    closed_announced: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    entries: Mapped[list["TournamentEntry"]] = relationship(cascade="all, delete-orphan")


class TournamentEntry(Base):
    __tablename__ = "tournament_entries"

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    tickets_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    best_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Un essai lancé mais jamais soumis (crash, abandon volontaire) reste
    # visible : le ticket est consommé dès le premier lancer.
    attempt_in_progress: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    player: Mapped["Player"] = relationship()
