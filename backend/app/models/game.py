import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, DateTime
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.elo import EloHistory
    from app.models.player import Player
    from app.models.season import Season

# Game homologation states (Epic 6): only COMPLETED games feed Elo and
# ranked stats. PENDING_REVIEW = outlier-flagged or player-reported, waiting
# for the league tribunal; VOIDED = cancelled by the tribunal.
STATUS_COMPLETED = "COMPLETED"
STATUS_PENDING_REVIEW = "PENDING_REVIEW"
STATUS_VOIDED = "VOIDED"


class Game(Base):
    __tablename__ = "games"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    mode: Mapped[str] = mapped_column(nullable=False)
    variant: Mapped[str | None] = mapped_column(nullable=True)
    duration: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Casual games are excluded from Elo (both the incremental update in
    # games.py::create_game and the full rebuild in elo_recompute.py) but
    # still counted for personal history/achievements.
    is_casual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    status: Mapped[str] = mapped_column(
        nullable=False, default=STATUS_COMPLETED, server_default=STATUS_COMPLETED
    )
    winner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id"), nullable=True
    )
    season_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seasons.id"), nullable=True
    )
    raw_data: Mapped[dict] = mapped_column(JSONB, nullable=False)

    winner: Mapped["Player | None"] = relationship(foreign_keys=[winner_id])
    season: Mapped["Season | None"] = relationship(back_populates="games")
    players: Mapped[list["GamePlayer"]] = relationship(back_populates="game", cascade="all, delete-orphan")
    elo_entries: Mapped[list["EloHistory"]] = relationship(back_populates="game")


class GamePlayer(Base):
    __tablename__ = "game_players"

    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("games.id"), primary_key=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id"), primary_key=True
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    game: Mapped["Game"] = relationship(back_populates="players")
    player: Mapped["Player"] = relationship(back_populates="game_links")
