import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_player
from app.models import League, Player
from app.models.league import PRIVACY_APPLICATION, PRIVACY_PUBLIC, ROLE_OWNER, ROLE_RANK
from app.schemas.league import (
    JoinRequestDecision,
    JoinRequestRead,
    LeagueCreate,
    LeagueJoin,
    LeaguePublicRead,
    LeagueRead,
    LeagueUpdate,
    MemberAdd,
    MemberRoleUpdate,
    OwnershipTransfer,
)
from app.services import leagues as leagues_service
from app.services import players as players_service

router = APIRouter(prefix="/leagues", tags=["leagues"])


async def _get_league_or_404(session: AsyncSession, league_id: uuid.UUID) -> League:
    league = await leagues_service.get_league(session, league_id)
    if league is None:
        raise HTTPException(404, "League not found")
    return league


def _role_of(league: League, player: Player) -> str | None:
    if league.owner_id == player.id:
        return ROLE_OWNER
    membership = leagues_service.membership_of(league, player.id)
    if membership is None or not membership.is_active:
        return None
    return membership.role


def _require_role(league: League, player: Player, min_role: str) -> None:
    role = _role_of(league, player)
    if role is None or ROLE_RANK[role] < ROLE_RANK[min_role]:
        raise HTTPException(403, f"Requires {min_role} rights on this league")


@router.post("", response_model=LeagueRead, status_code=201)
async def create_league(
    payload: LeagueCreate,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await leagues_service.create(
        session, player, payload.name, payload.motto, payload.icon, payload.privacy_level
    )
    return leagues_service.league_to_read(league)


@router.get("/mine", response_model=list[LeagueRead])
async def my_leagues(
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> list[LeagueRead]:
    rows = await leagues_service.list_mine(session, player.id)
    return [leagues_service.league_to_read(league) for league in rows]


@router.get("/public", response_model=list[LeaguePublicRead])
async def public_leagues(
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> list[LeaguePublicRead]:
    return await leagues_service.list_public(session)


@router.post("/join", response_model=LeagueRead)
async def join_league(
    payload: LeagueJoin,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await leagues_service.get_by_code(session, payload.code)
    if league is None:
        raise HTTPException(404, "Unknown invite code")
    league = await leagues_service.join(session, league, player)
    return leagues_service.league_to_read(league)


@router.post("/{league_id}/join", status_code=200)
async def join_league_direct(
    league_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
):
    """PUBLIC league: joins immediately. APPLICATION league: files a join
    request that an owner/admin must accept."""
    league = await _get_league_or_404(session, league_id)
    if league.privacy_level == PRIVACY_PUBLIC:
        league = await leagues_service.join(session, league, player)
        return leagues_service.league_to_read(league)
    if league.privacy_level == PRIVACY_APPLICATION:
        await leagues_service.submit_join_request(session, league, player)
        return {"status": "PENDING"}
    raise HTTPException(403, "This league requires an invite code")


@router.get("/{league_id}/requests", response_model=list[JoinRequestRead])
async def pending_requests(
    league_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> list[JoinRequestRead]:
    league = await _get_league_or_404(session, league_id)
    _require_role(league, player, "admin")
    return await leagues_service.list_pending_requests(session, league_id)


@router.post("/{league_id}/requests/{player_id}", response_model=LeagueRead)
async def decide_request(
    league_id: uuid.UUID,
    player_id: uuid.UUID,
    payload: JoinRequestDecision,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await _get_league_or_404(session, league_id)
    _require_role(league, player, "admin")
    decided = await leagues_service.decide_join_request(
        session, league, player_id, accept=payload.action == "accept"
    )
    if not decided:
        raise HTTPException(404, "No pending request for this player")
    return leagues_service.league_to_read(await _get_league_or_404(session, league_id))


def _require_member(league: League, player: Player) -> None:
    if _role_of(league, player) is None:
        raise HTTPException(403, "League members only")


def _player_ref(p: Player | None) -> dict | None:
    from app.services.players import image_url

    if p is None:
        return None
    return {
        "id": p.id,
        "name": p.name,
        "display_name": p.display_name,
        "avatar_url": image_url(p.avatar_path),
    }


@router.get("/{league_id}/events")
async def league_feed(
    league_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    league = await _get_league_or_404(session, league_id)
    _require_member(league, player)
    from app.services import league_events as events_service

    rows = await events_service.list_events(session, league_id, min(limit, 100), offset)
    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "actor": _player_ref(e.actor),
            "target": _player_ref(e.target),
            "story_text": e.story_text,
            "respect_count": e.respect_count,
            "created_at": e.created_at,
        }
        for e in rows
    ]


async def _get_event_or_404(session: AsyncSession, league_id: uuid.UUID, event_id: uuid.UUID):
    from app.models import LeagueEvent

    event = await session.get(LeagueEvent, event_id)
    if event is None or event.league_id != league_id:
        raise HTTPException(404, "Event not found")
    return event


@router.post("/{league_id}/events/{event_id}/respect")
async def respect_event(
    league_id: uuid.UUID,
    event_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> dict:
    league = await _get_league_or_404(session, league_id)
    _require_member(league, player)
    from app.services import league_events as events_service

    event = await _get_event_or_404(session, league_id, event_id)
    await events_service.add_respect(session, event)
    return {"respect_count": event.respect_count}


@router.post("/{league_id}/events/{event_id}/provoke", status_code=202)
async def provoke_from_event(
    league_id: uuid.UUID,
    event_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """« Provoquer » — v1 goes through the configured webhooks (no native
    push infra); the target is named in the message."""
    league = await _get_league_or_404(session, league_id)
    _require_member(league, player)
    from app.services.notifications import notify
    from app.services.targets.base import GameEvent

    event = await _get_event_or_404(session, league_id, event_id)
    target = await session.get(Player, event.target_id) if event.target_id else None
    await notify(
        session,
        GameEvent(
            type="provocation",
            data={
                "by": player.display_name or player.name,
                "target": (target.display_name or target.name) if target else None,
                "story": event.story_text,
            },
        ),
    )
    return {"status": "sent"}


@router.get("/{league_id}/pantheon")
async def league_pantheon(
    league_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    league = await _get_league_or_404(session, league_id)
    _require_member(league, player)
    from app.services import league_events as events_service

    rows = await events_service.get_pantheon(session, league_id)
    return [
        {
            "pillar": r.pillar,
            "holder": _player_ref(r.holder),
            "value": r.value,
            "achieved_at": r.achieved_at,
        }
        for r in rows
    ]


@router.get("/{league_id}/disputes")
async def league_disputes(
    league_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
):
    """Tribunal inbox: PENDING_REVIEW games involving this league's members."""
    league = await _get_league_or_404(session, league_id)
    _require_role(league, player, "admin")
    from app.services import tribunal as tribunal_service
    from app.services.games import _to_game_read

    games = await tribunal_service.list_disputes(session, league)
    return [_to_game_read(g) for g in games]


@router.patch("/{league_id}", response_model=LeagueRead)
async def update_league(
    league_id: uuid.UUID,
    payload: LeagueUpdate,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await _get_league_or_404(session, league_id)
    _require_role(league, player, "owner")
    league = await leagues_service.update(
        session,
        league,
        name=payload.name,
        motto=payload.motto,
        icon=payload.icon,
        privacy_level=payload.privacy_level,
    )
    return leagues_service.league_to_read(league)


@router.delete("/{league_id}", status_code=204)
async def delete_league(
    league_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> None:
    league = await _get_league_or_404(session, league_id)
    _require_role(league, player, "owner")
    await leagues_service.delete(session, league)


@router.post("/{league_id}/transfer", response_model=LeagueRead)
async def transfer_ownership(
    league_id: uuid.UUID,
    payload: OwnershipTransfer,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await _get_league_or_404(session, league_id)
    _require_role(league, player, "owner")
    target = leagues_service.membership_of(league, payload.player_id)
    if target is None or not target.is_active:
        raise HTTPException(404, "Target player is not an active member")
    league = await leagues_service.transfer_ownership(session, league, payload.player_id)
    return leagues_service.league_to_read(league)


@router.post("/{league_id}/members", response_model=LeagueRead)
async def add_member(
    league_id: uuid.UUID,
    payload: MemberAdd,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await _get_league_or_404(session, league_id)
    _require_role(league, player, "admin")
    member = await players_service.get_by_name(session, payload.name)
    if member is None:
        raise HTTPException(404, "Player not found")
    league = await leagues_service.add_member(session, league, member)
    return leagues_service.league_to_read(league)


@router.patch("/{league_id}/members/{player_id}/role", response_model=LeagueRead)
async def set_member_role(
    league_id: uuid.UUID,
    player_id: uuid.UUID,
    payload: MemberRoleUpdate,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> LeagueRead:
    league = await _get_league_or_404(session, league_id)
    _require_role(league, player, "owner")
    if player_id == league.owner_id:
        raise HTTPException(400, "Use /transfer to change the owner")
    target = leagues_service.membership_of(league, player_id)
    if target is None or not target.is_active:
        raise HTTPException(404, "Target player is not an active member")
    league = await leagues_service.set_member_role(session, league, player_id, payload.role)
    return leagues_service.league_to_read(league)


@router.delete("/{league_id}/members/{player_id}", status_code=204)
async def remove_member(
    league_id: uuid.UUID,
    player_id: uuid.UUID,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Leave (self) or kick (admin+). Deactivates the membership — the player
    becomes a ghost, history is preserved."""
    league = await _get_league_or_404(session, league_id)
    if player_id != player.id:
        _require_role(league, player, "admin")
        target = leagues_service.membership_of(league, player_id)
        # An admin can kick members; only the owner can kick another admin.
        if target is not None and target.role == "admin":
            _require_role(league, player, "owner")
    if player_id == league.owner_id:
        raise HTTPException(400, "The owner can't leave — transfer ownership or delete the league")
    await leagues_service.deactivate_member(session, league, player_id)
