"""Contextual title engine (Epic 8.1) — evaluated automatically at the end
of every recorded game, never assigned by hand.

The spec's stat_sniper (checkout %) needs per-dart data we don't record yet;
it'll join the catalogue once the Dart-Wheel starts sending throw details.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GamePlayer, League, Player, PlayerRating, PlayerTitle
from app.models.elo import GLOBAL_SCOPE
from app.models.title import TITLES
from app.services.elo import rank_for_rating
from app.services.elo_config import get_engine_config
from app.services.players import live_streak


async def _unlocked_ids(session: AsyncSession, player_id: uuid.UUID) -> set[str]:
    stmt = select(PlayerTitle.title_id).where(PlayerTitle.player_id == player_id)
    return set((await session.execute(stmt)).scalars().all())


async def _unlock(session: AsyncSession, player_id: uuid.UUID, title_id: str, equip: bool) -> None:
    session.add(PlayerTitle(player_id=player_id, title_id=title_id, is_equipped=equip))


async def evaluate_titles(session: AsyncSession, players: list[Player]) -> list[tuple[Player, str]]:
    """Checks every catalogue condition for `players`, unlocking what's newly
    earned (auto-equipped if the player has nothing equipped). Caller commits.
    Returns [(player, title_id), ...] for the newly unlocked ones."""
    config = await get_engine_config(session)
    newly: list[tuple[Player, str]] = []
    for player in players:
        unlocked = await _unlocked_ids(session, player.id)
        earned: list[str] = []

        if "rank_diamond" not in unlocked:
            rating = (
                await session.execute(
                    select(PlayerRating.rating).where(
                        PlayerRating.player_id == player.id, PlayerRating.scope == GLOBAL_SCOPE
                    )
                )
            ).scalar_one_or_none()
            if rating is not None:
                rank = rank_for_rating(rating, config)
                if rank.startswith("Diamond") or "Champion" in rank:
                    earned.append("rank_diamond")

        if "grind_20" not in unlocked and live_streak(player) >= 20:
            earned.append("grind_20")

        if "social_owner" not in unlocked:
            owns = (
                await session.execute(select(League.id).where(League.owner_id == player.id).limit(1))
            ).first()
            if owns:
                earned.append("social_owner")

        if "fail_26" not in unlocked:
            n = (
                await session.execute(
                    select(func.count()).select_from(GamePlayer).where(
                        GamePlayer.player_id == player.id, GamePlayer.score == 26
                    )
                )
            ).scalar_one()
            if n >= 3:
                earned.append("fail_26")

        has_equipped = bool(
            (
                await session.execute(
                    select(PlayerTitle.title_id)
                    .where(PlayerTitle.player_id == player.id, PlayerTitle.is_equipped.is_(True))
                    .limit(1)
                )
            ).first()
        )
        for title_id in earned:
            await _unlock(session, player.id, title_id, equip=not has_equipped)
            has_equipped = True
            newly.append((player, title_id))
    return newly


async def list_titles(session: AsyncSession, player_id: uuid.UUID) -> list[PlayerTitle]:
    stmt = (
        select(PlayerTitle)
        .where(PlayerTitle.player_id == player_id)
        .order_by(PlayerTitle.unlocked_at)
    )
    return list((await session.execute(stmt)).scalars().all())


async def equip(session: AsyncSession, player_id: uuid.UUID, title_id: str) -> bool:
    rows = await list_titles(session, player_id)
    if title_id not in {r.title_id for r in rows}:
        return False
    for row in rows:
        row.is_equipped = row.title_id == title_id
    await session.commit()
    return True


