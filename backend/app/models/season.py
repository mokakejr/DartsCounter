import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.game import Game


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    games: Mapped[list["Game"]] = relationship(back_populates="season")


class SeasonRating(Base):
    """Snapshot des ratings (compressés par le soft reset) au début d'une
    saison — la base que recompute_all utilise pour ne rejouer que les
    parties de la saison courante, sans casser la re-dérivabilité."""

    __tablename__ = "season_ratings"

    season_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seasons.id", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    scope: Mapped[str] = mapped_column(primary_key=True)
    rating: Mapped[float] = mapped_column(Float, nullable=False)
    games_played: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
