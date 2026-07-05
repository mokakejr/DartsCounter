import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


@dataclass(frozen=True)
class TitleDef:
    id: str
    label: str
    description: str


# Catalogue lives here (not in the service) so schema/read helpers can name
# titles without import cycles. stat_sniper (checkout %) joins once the
# Dart-Wheel records per-dart data.
TITLES: dict[str, TitleDef] = {
    t.id: t
    for t in (
        TitleDef("rank_diamond", "Légende du Triple 20", "Atteindre le rang Diamant"),
        TitleDef("grind_20", "Pilier de Comptoir", "20 jours de streak d'affilée"),
        TitleDef("social_owner", "Tyran de la Ligue", "Posséder une ligue"),
        TitleDef("fail_26", "Abonné au 26", "Finir 3 parties à exactement 26 points"),
    )
}


class PlayerTitle(Base):
    """Unlocked contextual titles (Epic 8.1) — one row per (player, title),
    at most one equipped per player."""

    __tablename__ = "player_titles"

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    title_id: Mapped[str] = mapped_column(Text, primary_key=True)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_equipped: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
