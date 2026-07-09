from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models import Player


class NameTakenError(Exception):
    """The name is already claimed by an account (password_hash already set)."""


async def signup(session: AsyncSession, name: str, password: str) -> Player:
    """Creates a fresh player, or claims an existing unclaimed one (a name
    already in use by anonymous games recorded from the counter app, which
    have no account attached yet)."""
    player = (await session.execute(select(Player).where(Player.name == name))).scalar_one_or_none()
    if player is not None and player.password_hash is not None:
        raise NameTakenError(name)

    if player is None:
        player = Player(name=name, password_hash=hash_password(password))
        session.add(player)
    else:
        player.password_hash = hash_password(password)

    player.last_login = datetime.now(timezone.utc)
    await session.commit()
    return player


async def authenticate(session: AsyncSession, name: str, password: str) -> Player | None:
    player = (await session.execute(select(Player).where(Player.name == name))).scalar_one_or_none()
    if player is None or player.password_hash is None:
        return None
    if not verify_password(password, player.password_hash):
        return None
    player.last_login = datetime.now(timezone.utc)
    await session.commit()
    return player
