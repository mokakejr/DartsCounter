import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.game import Game
    from app.models.player import Player


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


class SeasonStanding(Base):
    """Classement figé d'une ligue à la clôture d'une saison — le palmarès.

    SeasonRating garde les ratings *compressés* du début de la saison
    suivante ; ici on garde le classement tel qu'il était à la fin, avant le
    soft reset, pour pouvoir le reconsulter mois après mois."""

    __tablename__ = "season_standings"

    season_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seasons.id", ondelete="CASCADE"), primary_key=True
    )
    league_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leagues.id", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 = champion
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    games: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Le rang Elo (« Diamant II ») au moment de la clôture : le barème est
    # réglable en admin, le recalculer plus tard réécrirait l'histoire.
    rank_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Le #1 n'est sacré que s'il a atteint min_ranked_games ; on fige le
    # résultat plutôt que de le rejouer contre une config qui a pu bouger.
    is_champion: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    player: Mapped["Player"] = relationship()
