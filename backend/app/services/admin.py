import uuid
from datetime import date, datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.models import EloHistory, Game, Player, Season, WebhookTarget
from app.models.admin_log import AdminLog
from app.services import elo_recompute


async def log_action(
    session: AsyncSession,
    admin_id: uuid.UUID,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    details: dict | None = None,
) -> AdminLog:
    entry = AdminLog(
        admin_id=admin_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
    )
    session.add(entry)
    return entry


async def list_logs(session: AsyncSession, limit: int = 100) -> list[AdminLog]:
    rows = (
        await session.execute(
            select(AdminLog)
            .options(selectinload(AdminLog.admin))
            .order_by(AdminLog.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return list(rows)


async def list_players(session: AsyncSession) -> list[Player]:
    rows = (
        await session.execute(select(Player).order_by(Player.name))
    ).scalars().all()
    return list(rows)


async def delete_game(session: AsyncSession, game_id: uuid.UUID) -> bool:
    game = await session.get(Game, game_id)
    if game is None:
        return False
    # EloHistory has no ORM cascade — must delete before the game row
    await session.execute(delete(EloHistory).where(EloHistory.game_id == game_id))
    # GamePlayer is cascade="all, delete-orphan" via the ORM relationship
    await session.delete(game)
    await session.commit()
    # Full ELO rebuild from remaining games (has its own commit)
    await elo_recompute.recompute_all(session)
    return True


async def reset_password(session: AsyncSession, player_id: uuid.UUID, new_password: str) -> bool:
    player = await session.get(Player, player_id)
    if player is None:
        return False
    player.password_hash = hash_password(new_password)
    await session.commit()
    return True


async def set_admin_role(session: AsyncSession, player_id: uuid.UUID, is_admin: bool) -> Player | None:
    player = await session.get(Player, player_id)
    if player is None:
        return None
    player.is_admin = is_admin
    await session.commit()
    await session.refresh(player)
    return player


async def list_seasons(session: AsyncSession) -> list[Season]:
    rows = (
        await session.execute(select(Season).order_by(Season.start_date.desc()))
    ).scalars().all()
    return list(rows)


async def create_season(
    session: AsyncSession,
    name: str,
    start_date: date | None,
) -> Season:
    today = datetime.now(timezone.utc).date()
    # Close any currently active season
    await session.execute(
        update(Season)
        .where(Season.is_active.is_(True))
        .values(is_active=False, end_date=today)
    )
    season = Season(
        name=name,
        start_date=start_date or today,
        is_active=True,
    )
    session.add(season)
    await session.commit()
    await session.refresh(season)
    return season


async def update_season(
    session: AsyncSession,
    season_id: uuid.UUID,
    data: dict,
) -> Season | None:
    season = await session.get(Season, season_id)
    if season is None:
        return None
    for key, val in data.items():
        if val is not None:
            setattr(season, key, val)
    await session.commit()
    await session.refresh(season)
    return season
