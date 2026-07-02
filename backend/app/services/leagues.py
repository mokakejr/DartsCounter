import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import League, Player
from app.models.league import league_members
from app.schemas.league import LeagueMemberRead, LeagueRead
from app.services.players import image_url

# No 0/O/1/I/L — codes get read out loud across a dartboard.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _make_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))


def league_to_read(league: League) -> LeagueRead:
    return LeagueRead(
        id=league.id,
        name=league.name,
        owner_id=league.owner_id,
        invite_code=league.invite_code,
        created_at=league.created_at,
        members=[
            LeagueMemberRead(
                id=m.id,
                name=m.name,
                display_name=m.display_name,
                avatar_url=image_url(m.avatar_path),
            )
            for m in sorted(league.members, key=lambda m: m.name)
        ],
    )


async def get_league(session: AsyncSession, league_id: uuid.UUID) -> League | None:
    stmt = select(League).where(League.id == league_id).options(selectinload(League.members))
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_mine(session: AsyncSession, player_id: uuid.UUID) -> list[League]:
    stmt = (
        select(League)
        .join(league_members, league_members.c.league_id == League.id)
        .where(league_members.c.player_id == player_id)
        .options(selectinload(League.members))
        .order_by(League.created_at)
    )
    return list((await session.execute(stmt)).scalars().all())


async def create(session: AsyncSession, owner: Player, name: str) -> League:
    # ponytail: check-then-insert race on the code is theoretical at this
    # scale; the unique constraint backstops it.
    code = _make_code()
    while (await session.execute(select(League.id).where(League.invite_code == code))).first():
        code = _make_code()
    league = League(name=name.strip(), owner_id=owner.id, invite_code=code, members=[owner])
    session.add(league)
    await session.commit()
    return await get_league(session, league.id)


async def get_by_code(session: AsyncSession, code: str) -> League | None:
    stmt = (
        select(League)
        .where(League.invite_code == code.strip().upper())
        .options(selectinload(League.members))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def join(session: AsyncSession, league: League, player: Player) -> League:
    if all(m.id != player.id for m in league.members):
        league.members.append(player)
        await session.commit()
    return league


async def rename(session: AsyncSession, league: League, name: str) -> League:
    league.name = name.strip()
    await session.commit()
    return league


async def delete(session: AsyncSession, league: League) -> None:
    await session.delete(league)
    await session.commit()


async def add_member(session: AsyncSession, league: League, player: Player) -> League:
    return await join(session, league, player)


async def remove_member(session: AsyncSession, league: League, player_id: uuid.UUID) -> League:
    league.members = [m for m in league.members if m.id != player_id]
    await session.commit()
    return league
