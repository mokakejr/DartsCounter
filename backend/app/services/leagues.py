import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import League, LeagueJoinRequest, LeagueMember, Player
from app.models.league import (
    REQUEST_ACCEPTED,
    REQUEST_PENDING,
    REQUEST_REJECTED,
    ROLE_ADMIN,
    ROLE_MEMBER,
    ROLE_OWNER,
)
from app.schemas.league import JoinRequestRead, LeagueMemberRead, LeaguePublicRead, LeagueRead
from app.services.players import image_url

logger = logging.getLogger(__name__)

# No 0/O/1/I/L — codes get read out loud across a dartboard.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

OWNER_INACTIVITY = timedelta(days=30)

# The Taverne: system-owned PUBLIC league every accountless-league player is
# auto-assigned to, so there's never a "no league = no game" wall (Epic 1.1).
TAVERNE_LEAGUE_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
TAVERNE_NAME = "La Taverne"

_MEMBERS_LOADED = selectinload(League.memberships).selectinload(LeagueMember.player)


def _make_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))


def membership_of(league: League, player_id: uuid.UUID) -> LeagueMember | None:
    return next((m for m in league.memberships if m.player_id == player_id), None)


def league_to_read(league: League) -> LeagueRead:
    # Active members first (sorted by name), ghosts at the end.
    ordered = sorted(league.memberships, key=lambda m: (not m.is_active, m.player.name))
    return LeagueRead(
        id=league.id,
        name=league.name,
        motto=league.motto,
        icon=league.icon,
        privacy_level=league.privacy_level,
        owner_id=league.owner_id,
        invite_code=league.invite_code,
        webhook_url=league.webhook_url,
        created_at=league.created_at,
        members=[
            LeagueMemberRead(
                id=m.player.id,
                name=m.player.name,
                display_name=m.player.display_name,
                avatar_url=image_url(m.player.avatar_path),
                role=m.role,
                is_active=m.is_active,
            )
            for m in ordered
        ],
    )


async def get_league(session: AsyncSession, league_id: uuid.UUID) -> League | None:
    stmt = select(League).where(League.id == league_id).options(_MEMBERS_LOADED)
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_mine(session: AsyncSession, player_id: uuid.UUID) -> list[League]:
    stmt = (
        select(League)
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .where(LeagueMember.player_id == player_id, LeagueMember.is_active.is_(True))
        .options(_MEMBERS_LOADED)
        .order_by(League.created_at)
    )
    return list((await session.execute(stmt)).scalars().all())


async def list_public(session: AsyncSession) -> list[LeaguePublicRead]:
    count_col = func.count(LeagueMember.player_id).filter(LeagueMember.is_active.is_(True))
    stmt = (
        select(League, count_col.label("member_count"))
        .outerjoin(LeagueMember, LeagueMember.league_id == League.id)
        .where(League.privacy_level != "PRIVATE_CODE")
        .group_by(League.id)
        .order_by(League.created_at)
    )
    rows = (await session.execute(stmt)).all()
    return [
        LeaguePublicRead(
            id=r.League.id,
            name=r.League.name,
            motto=r.League.motto,
            icon=r.League.icon,
            privacy_level=r.League.privacy_level,
            member_count=r.member_count,
        )
        for r in rows
    ]


async def create(
    session: AsyncSession,
    owner: Player,
    name: str,
    motto: str | None = None,
    icon: str | None = None,
    privacy_level: str = "PRIVATE_CODE",
) -> League:
    # ponytail: check-then-insert race on the code is theoretical at this
    # scale; the unique constraint backstops it.
    code = _make_code()
    while (await session.execute(select(League.id).where(League.invite_code == code))).first():
        code = _make_code()
    league = League(
        name=name.strip(),
        motto=motto.strip() if motto else None,
        icon=icon,
        privacy_level=privacy_level,
        owner_id=owner.id,
        invite_code=code,
        memberships=[LeagueMember(player_id=owner.id, role=ROLE_OWNER)],
    )
    session.add(league)
    await session.commit()
    return await get_league(session, league.id)


async def get_by_code(session: AsyncSession, code: str) -> League | None:
    stmt = (
        select(League)
        .where(League.invite_code == code.strip().upper())
        .options(_MEMBERS_LOADED)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def join(session: AsyncSession, league: League, player: Player) -> League:
    """Adds the player, or reactivates their ghost membership if they left."""
    membership = membership_of(league, player.id)
    if membership is None:
        league.memberships.append(LeagueMember(player_id=player.id, role=ROLE_MEMBER))
        await session.commit()
    elif not membership.is_active:
        membership.is_active = True
        membership.role = ROLE_MEMBER
        await session.commit()
    return await get_league(session, league.id)


async def update(session: AsyncSession, league: League, **fields) -> League:
    for key, value in fields.items():
        if value is not None:
            setattr(league, key, value.strip() if isinstance(value, str) else value)
    await session.commit()
    return league


async def delete(session: AsyncSession, league: League) -> None:
    await session.delete(league)
    await session.commit()


async def deactivate_member(session: AsyncSession, league: League, player_id: uuid.UUID) -> None:
    """Leave/kick: never DELETE — history (games, Elo) keeps resolving; the
    member becomes a ghost (greyed out, unranked)."""
    membership = membership_of(league, player_id)
    if membership is not None and membership.is_active:
        membership.is_active = False
        if membership.role != ROLE_OWNER:
            membership.role = ROLE_MEMBER
        await session.commit()


async def set_member_role(session: AsyncSession, league: League, player_id: uuid.UUID, role: str) -> League:
    membership = membership_of(league, player_id)
    if membership is not None:
        membership.role = role
        await session.commit()
    return league


async def transfer_ownership(session: AsyncSession, league: League, new_owner_id: uuid.UUID) -> League:
    old = membership_of(league, league.owner_id)
    new = membership_of(league, new_owner_id)
    if old is not None:
        old.role = ROLE_ADMIN
    if new is not None:
        new.role = ROLE_OWNER
    league.owner_id = new_owner_id
    await session.commit()
    return league


async def _get_or_create_taverne(session: AsyncSession) -> League:
    league = await get_league(session, TAVERNE_LEAGUE_ID)
    if league is None:
        league = League(
            id=TAVERNE_LEAGUE_ID,
            name=TAVERNE_NAME,
            motto="L'échauffement commence ici",
            icon="tavern",
            privacy_level="PUBLIC",
            owner_id=None,
            invite_code="TAVERNE",
        )
        session.add(league)
        await session.commit()
        league = await get_league(session, TAVERNE_LEAGUE_ID)
    return league


async def ensure_default_league(session: AsyncSession, player: Player) -> None:
    """Post-login/signup hook: a player with no active league lands in the
    Taverne immediately."""
    if await list_mine(session, player.id):
        return
    taverne = await _get_or_create_taverne(session)
    await join(session, taverne, player)


# --- Join requests (APPLICATION privacy level) ---


async def submit_join_request(session: AsyncSession, league: League, player: Player) -> None:
    existing = await session.get(LeagueJoinRequest, (league.id, player.id))
    if existing is None:
        session.add(LeagueJoinRequest(league_id=league.id, player_id=player.id))
    else:
        existing.status = REQUEST_PENDING
    await session.commit()


async def list_pending_requests(session: AsyncSession, league_id: uuid.UUID) -> list[JoinRequestRead]:
    stmt = (
        select(LeagueJoinRequest)
        .where(LeagueJoinRequest.league_id == league_id, LeagueJoinRequest.status == REQUEST_PENDING)
        .options(selectinload(LeagueJoinRequest.player))
        .order_by(LeagueJoinRequest.created_at)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        JoinRequestRead(
            league_id=r.league_id,
            player_id=r.player_id,
            name=r.player.name,
            display_name=r.player.display_name,
            avatar_url=image_url(r.player.avatar_path),
            status=r.status,
            created_at=r.created_at,
        )
        for r in rows
    ]


async def decide_join_request(
    session: AsyncSession, league: League, player_id: uuid.UUID, accept: bool
) -> bool:
    request = await session.get(LeagueJoinRequest, (league.id, player_id))
    if request is None or request.status != REQUEST_PENDING:
        return False
    request.status = REQUEST_ACCEPTED if accept else REQUEST_REJECTED
    if accept:
        player = await session.get(Player, player_id)
        await join(session, league, player)
    else:
        await session.commit()
    return True


# --- Ownership inheritance (absentee owner, Epic 3.3) ---


def _activity(player: Player) -> datetime:
    return player.last_login or player.created_at


async def run_ownership_inheritance(session: AsyncSession) -> int:
    """Nightly: owners inactive for 30+ days hand the league to the most
    recently active admin, else the oldest active member. Candidates must
    have an account (password_hash) — anonymous players can't administrate."""
    cutoff = datetime.now(timezone.utc) - OWNER_INACTIVITY
    leagues = (
        (await session.execute(select(League).options(_MEMBERS_LOADED))).scalars().all()
    )
    transferred = 0
    for league in leagues:
        owner_m = membership_of(league, league.owner_id)
        if owner_m is None or _activity(owner_m.player) > cutoff:
            continue
        candidates = [
            m
            for m in league.memberships
            if m.is_active and m.player_id != league.owner_id and m.player.password_hash is not None
        ]
        if not candidates:
            continue
        admins = [m for m in candidates if m.role == ROLE_ADMIN]
        if admins:
            heir = max(admins, key=lambda m: _activity(m.player))
        else:
            heir = min(candidates, key=lambda m: m.joined_at)
        logger.info("League %s: transferring ownership %s -> %s", league.id, league.owner_id, heir.player_id)
        await transfer_ownership(session, league, heir.player_id)
        transferred += 1
    return transferred


# Kept for the admin "add member by name" endpoint.
async def add_member(session: AsyncSession, league: League, player: Player) -> League:
    return await join(session, league, player)
