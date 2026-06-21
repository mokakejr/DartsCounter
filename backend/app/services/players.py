from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Player


async def get_or_create_player(
    session: AsyncSession, name: str, cache: dict[str, Player] | None = None
) -> Player:
    if cache is not None and name in cache:
        return cache[name]
    player = (await session.execute(select(Player).where(Player.name == name))).scalar_one_or_none()
    if player is None:
        player = Player(name=name)
        session.add(player)
        await session.flush()
    if cache is not None:
        cache[name] = player
    return player


async def list_players(session: AsyncSession) -> list[Player]:
    return list((await session.execute(select(Player).order_by(Player.name))).scalars().all())
