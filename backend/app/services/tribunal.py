"""Le Tribunal (Epic 6.3): player reports + league owner/admin adjudication
of frozen games.

A game has no league_id — leagues are player groupings — so "the tribunal of
a game" is any league owner/admin whose active members include one of the
game's participants (global is_admin bypasses)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Game, GamePlayer, League, LeagueMember, Player
from app.models.game import STATUS_COMPLETED, STATUS_PENDING_REVIEW, STATUS_VOIDED
from app.models.league import ROLE_ADMIN, ROLE_OWNER
from app.services.anticheat import TRUST_CLEARED, TRUST_REPORTED, TRUST_VOIDED, bump_trust
from app.services.elo_recompute import recompute_all

REPORT_REASONS = ("impossible_score", "rage_quit", "other")


async def _game_player_ids(session: AsyncSession, game_id: uuid.UUID) -> list[uuid.UUID]:
    stmt = select(GamePlayer.player_id).where(GamePlayer.game_id == game_id)
    return list((await session.execute(stmt)).scalars().all())


async def can_adjudicate(session: AsyncSession, player: Player, game_id: uuid.UUID) -> bool:
    if player.is_admin:
        return True
    participant_ids = await _game_player_ids(session, game_id)
    stmt = (
        select(LeagueMember.league_id)
        .where(
            LeagueMember.player_id == player.id,
            LeagueMember.is_active.is_(True),
            LeagueMember.role.in_((ROLE_OWNER, ROLE_ADMIN)),
        )
    )
    admin_league_ids = set((await session.execute(stmt)).scalars().all())
    if not admin_league_ids:
        return False
    stmt = select(LeagueMember.league_id).where(
        LeagueMember.player_id.in_(participant_ids),
        LeagueMember.league_id.in_(admin_league_ids),
        LeagueMember.is_active.is_(True),
    )
    return (await session.execute(stmt)).first() is not None


async def report_game(session: AsyncSession, game: Game, reporter: Player, reason: str) -> None:
    """Flags a COMPLETED game: freezes it (Elo removed via full recompute,
    which skips non-COMPLETED games) and dents the accused winner's trust."""
    game.status = STATUS_PENDING_REVIEW
    game.flag_reason = reason
    game.reported_by = reporter.id
    if game.winner_id is not None:
        accused = await session.get(Player, game.winner_id)
        if accused is not None:
            bump_trust(accused, TRUST_REPORTED)
    await session.commit()
    await recompute_all(session)


async def adjudicate(session: AsyncSession, game: Game, validate: bool) -> None:
    """validate=True: homologate (deferred Elo lands via recompute, wrongly
    accused winner gets a trust boost). validate=False: void the game."""
    game.status = STATUS_COMPLETED if validate else STATUS_VOIDED
    if game.winner_id is not None:
        accused = await session.get(Player, game.winner_id)
        if accused is not None:
            bump_trust(accused, TRUST_CLEARED if validate else TRUST_VOIDED)
    await session.commit()
    await recompute_all(session)


async def list_disputes(session: AsyncSession, league: League) -> list[Game]:
    """PENDING_REVIEW games involving at least one active member of the league."""
    member_ids = [m.player_id for m in league.memberships if m.is_active]
    if not member_ids:
        return []
    stmt = (
        select(Game)
        .join(GamePlayer, GamePlayer.game_id == Game.id)
        .where(Game.status == STATUS_PENDING_REVIEW, GamePlayer.player_id.in_(member_ids))
        .options(selectinload(Game.players).selectinload(GamePlayer.player), selectinload(Game.winner))
        .order_by(Game.date.desc())
        .distinct()
    )
    return list((await session.execute(stmt)).scalars().all())
