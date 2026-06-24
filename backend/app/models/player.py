import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.elo import EloHistory
    from app.models.game import GamePlayer


class Player(Base):
    __tablename__ = "players"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # All nullable — null password_hash means "no account", i.e. an ordinary
    # anonymous player created on the fly by the counter app (get_or_create_player).
    # Signing up either claims an existing unclaimed row or creates a new one.
    password_hash: Mapped[str | None] = mapped_column(nullable=True)
    display_name: Mapped[str | None] = mapped_column(nullable=True)
    avatar_path: Mapped[str | None] = mapped_column(nullable=True)
    flight_image_path: Mapped[str | None] = mapped_column(nullable=True)
    accent_color: Mapped[str | None] = mapped_column(nullable=True)

    # Relative (0.0-1.0) crop region within the source flight image, e.g.
    # {"x": .1, "y": .1, "w": .5, "h": .5, "scale": 1.0} — survives the
    # upload pipeline's resize since that preserves aspect ratio.
    flight_crop_a: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Only used when flight_mode == "paired" (vanes 1+3); null in "symmetric" mode.
    flight_crop_b: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    flight_mode: Mapped[str] = mapped_column(nullable=False, server_default="symmetric")

    game_links: Mapped[list["GamePlayer"]] = relationship(back_populates="player")
    elo_history: Mapped[list["EloHistory"]] = relationship(back_populates="player")
