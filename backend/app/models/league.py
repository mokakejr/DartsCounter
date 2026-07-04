import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.player import Player

# Membership roles, lowest to highest.
ROLE_MEMBER = "member"
ROLE_ADMIN = "admin"
ROLE_OWNER = "owner"
ROLE_RANK = {ROLE_MEMBER: 0, ROLE_ADMIN: 1, ROLE_OWNER: 2}

PRIVACY_PUBLIC = "PUBLIC"
PRIVACY_PRIVATE_CODE = "PRIVATE_CODE"
PRIVACY_APPLICATION = "APPLICATION"

REQUEST_PENDING = "PENDING"
REQUEST_ACCEPTED = "ACCEPTED"
REQUEST_REJECTED = "REJECTED"


class LeagueMember(Base):
    __tablename__ = "league_members"

    league_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leagues.id", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(Text, nullable=False, default=ROLE_MEMBER, server_default=ROLE_MEMBER)
    # Leaving a league never deletes the row (games/Elo history must keep
    # resolving) — the member just goes inactive ("ghost").
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    player: Mapped["Player"] = relationship()


class League(Base):
    __tablename__ = "leagues"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    motto: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(Text, nullable=True)  # preset id, rendered by the front
    privacy_level: Mapped[str] = mapped_column(
        Text, nullable=False, default=PRIVACY_PRIVATE_CODE, server_default=PRIVACY_PRIVATE_CODE
    )
    # Null owner = system league (the Taverne): nobody holds owner rights.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), nullable=True
    )
    invite_code: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    memberships: Mapped[list[LeagueMember]] = relationship(cascade="all, delete-orphan")


class LeagueJoinRequest(Base):
    """One row per (league, player) — re-applying after a rejection flips the
    same row back to PENDING."""

    __tablename__ = "league_join_requests"

    league_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leagues.id", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, default=REQUEST_PENDING, server_default=REQUEST_PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    player: Mapped["Player"] = relationship()
