import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Game, GamePlayer, Player
from app.schemas.player import PlayerRead
from app.services.progression import effective_streak, paris_date


def image_url(path: str | None) -> str | None:
    return f"{get_settings().public_api_url}/uploads/{path}" if path else None


def live_streak(player: Player) -> int:
    last = paris_date(player.last_streak_update) if player.last_streak_update else None
    return effective_streak(last, player.current_streak, paris_date())


def player_to_read(player: Player) -> PlayerRead:
    return PlayerRead(
        id=player.id,
        name=player.name,
        display_name=player.display_name,
        avatar_url=image_url(player.avatar_path),
        flight_image_url=image_url(player.flight_image_path),
        flight_crop_a=player.flight_crop_a,
        flight_crop_b=player.flight_crop_b,
        flight_mode=player.flight_mode,
        accent_color=player.accent_color,
        is_admin=player.is_admin,
        created_at=player.created_at,
        ferveur_xp=player.ferveur_xp,
        ferveur_level=player.ferveur_level,
        current_streak=live_streak(player),
    )


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


async def list_players(session: AsyncSession) -> list[PlayerRead]:
    rows = (await session.execute(select(Player).order_by(Player.name))).scalars().all()
    return [player_to_read(p) for p in rows]


async def count_games_played(session: AsyncSession, player_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(GamePlayer)
        .join(Game, Game.id == GamePlayer.game_id)
        .where(GamePlayer.player_id == player_id, Game.is_casual.is_(False))
    )
    return (await session.execute(stmt)).scalar_one()


async def get_by_name(session: AsyncSession, name: str) -> Player | None:
    return (await session.execute(select(Player).where(Player.name == name))).scalar_one_or_none()


class NameTakenError(Exception):
    pass


async def update_profile(session: AsyncSession, player: Player, updates: dict) -> Player:
    """`updates` should come from `payload.model_dump(exclude_unset=True)` so
    omitted fields are left untouched and an explicit null still clears one."""
    if "name" in updates and updates["name"] != player.name:
        clash = (
            await session.execute(select(Player).where(Player.name == updates["name"]))
        ).scalar_one_or_none()
        if clash is not None:
            raise NameTakenError(updates["name"])
        player.name = updates["name"]
    if "display_name" in updates:
        player.display_name = updates["display_name"]
    if "accent_color" in updates:
        player.accent_color = updates["accent_color"]
    if "flight_crop_a" in updates:
        player.flight_crop_a = updates["flight_crop_a"]
    if "flight_crop_b" in updates:
        player.flight_crop_b = updates["flight_crop_b"]
    if "flight_mode" in updates:
        player.flight_mode = updates["flight_mode"]

    await session.commit()
    return player


async def set_image_path(session: AsyncSession, player: Player, slot: str, path: str) -> Player:
    if slot == "avatar":
        player.avatar_path = path
    else:
        player.flight_image_path = path
    await session.commit()
    return player
