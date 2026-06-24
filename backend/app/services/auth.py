from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models import Player


class NameTakenError(Exception):
    """The name already exists as a player (with or without an account)."""


async def signup(session: AsyncSession, name: str, password: str) -> Player:
    """Creates a brand-new player. Names are unique and never reused: if a
    player with this name already exists — whether it has an account or was
    auto-created from a counter game — sign-up is rejected. Those players log in
    instead (with the default password until they change it)."""
    existing = (await session.execute(select(Player).where(Player.name == name))).scalar_one_or_none()
    if existing is not None:
        raise NameTakenError(name)

    player = Player(name=name, password_hash=hash_password(password))
    session.add(player)
    await session.commit()
    return player


async def authenticate(session: AsyncSession, name: str, password: str) -> Player | None:
    player = (await session.execute(select(Player).where(Player.name == name))).scalar_one_or_none()
    if player is None or player.password_hash is None:
        return None
    if not verify_password(password, player.password_hash):
        return None
    return player
