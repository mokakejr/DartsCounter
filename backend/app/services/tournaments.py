"""Tournois asynchrones « score attack » (Hub v2 / Epic 2.5).

Mécanique des tickets = rendez-vous (appointment mechanic) : 3 essais par
tournoi, consommés dès le premier lancer, seul le meilleur score compte.
Égalité stricte : le premier à avoir soumis gagne (on ne remplace le best
que sur amélioration STRICTE, best_at fait donc foi naturellement).
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import LeagueEvent, Player, Tournament, TournamentEntry
from app.models.tournament import GOAL_FEWEST_DARTS
from app.services.players import image_url

logger = logging.getLogger(__name__)

PHASE_UPCOMING = "upcoming"
PHASE_LIVE = "live"
PHASE_PAST = "past"

REMINDER_BEFORE = timedelta(hours=6)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def phase_of(t: Tournament, now: datetime | None = None) -> str:
    now = now or _now()
    if now < t.starts_at:
        return PHASE_UPCOMING
    if now <= t.ends_at:
        return PHASE_LIVE
    return PHASE_PAST


def _is_better(goal: str, value: int, best: int | None) -> bool:
    if best is None:
        return True
    return value < best if goal == GOAL_FEWEST_DARTS else value > best


def _leaderboard(t: Tournament) -> list[TournamentEntry]:
    scored = [e for e in t.entries if e.best_value is not None]
    reverse = t.goal != GOAL_FEWEST_DARTS
    # Meilleur score d'abord ; à égalité, le plus ancien best_at gagne.
    scored.sort(key=lambda e: (e.best_value if not reverse else -e.best_value, e.best_at))
    return scored


def to_dict(t: Tournament) -> dict:
    ranked = _leaderboard(t)
    rank_of = {e.player_id: i + 1 for i, e in enumerate(ranked)}
    return {
        "id": t.id,
        "league_id": t.league_id,
        "title": t.title,
        "mode": t.mode,
        "goal": t.goal,
        "starts_at": t.starts_at,
        "ends_at": t.ends_at,
        "max_tickets": t.max_tickets,
        "phase": phase_of(t),
        "participants": len(t.entries),
        "entries": [
            {
                "player_id": e.player_id,
                "name": e.player.name,
                "display_name": e.player.display_name,
                "avatar_url": image_url(e.player.avatar_path),
                "tickets_used": e.tickets_used,
                "tickets_left": max(t.max_tickets - e.tickets_used, 0),
                "best_value": e.best_value,
                "best_at": e.best_at,
                "attempt_in_progress": e.attempt_in_progress,
                "rank": rank_of.get(e.player_id),
            }
            for e in sorted(t.entries, key=lambda e: (rank_of.get(e.player_id, 999), e.joined_at))
        ],
    }


_LOADED = selectinload(Tournament.entries).selectinload(TournamentEntry.player)


async def get_tournament(session: AsyncSession, tournament_id: uuid.UUID) -> Tournament | None:
    stmt = select(Tournament).where(Tournament.id == tournament_id).options(_LOADED)
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_for_league(session: AsyncSession, league_id: uuid.UUID) -> list[Tournament]:
    stmt = (
        select(Tournament)
        .where(Tournament.league_id == league_id)
        .options(_LOADED)
        .order_by(Tournament.starts_at.desc())
        .limit(20)
    )
    return list((await session.execute(stmt)).scalars().all())


async def create(
    session: AsyncSession,
    league_id: uuid.UUID,
    title: str,
    mode: str,
    goal: str,
    starts_at: datetime,
    ends_at: datetime,
    created_by: uuid.UUID | None,
    max_tickets: int = 3,
) -> Tournament:
    t = Tournament(
        league_id=league_id,
        title=title.strip(),
        mode=mode,
        goal=goal,
        starts_at=starts_at,
        ends_at=ends_at,
        max_tickets=max_tickets,
        created_by=created_by,
    )
    session.add(t)
    await session.commit()
    return await get_tournament(session, t.id)


def entry_of(t: Tournament, player_id: uuid.UUID) -> TournamentEntry | None:
    return next((e for e in t.entries if e.player_id == player_id), None)


async def enter(session: AsyncSession, t: Tournament, player: Player) -> TournamentEntry:
    entry = entry_of(t, player.id)
    if entry is None:
        entry = TournamentEntry(tournament_id=t.id, player_id=player.id)
        t.entries.append(entry)
        await session.commit()
        entry = entry_of(await get_tournament(session, t.id), player.id)
    return entry


class NoTicketError(Exception):
    pass


async def start_attempt(session: AsyncSession, t: Tournament, player: Player) -> TournamentEntry:
    """Consomme un ticket — définitivement, dès le premier lancer (un crash
    ou un abandon ne le rend pas)."""
    entry = await enter(session, t, player)
    if entry.tickets_used >= t.max_tickets:
        raise NoTicketError()
    entry.tickets_used += 1
    entry.attempt_in_progress = True  # tension « essai en cours » au lobby
    await session.commit()
    return entry


async def submit_attempt(
    session: AsyncSession, t: Tournament, player: Player, value: int
) -> TournamentEntry | None:
    entry = entry_of(t, player.id)
    if entry is None or entry.tickets_used == 0:
        return None
    entry.attempt_in_progress = False
    if _is_better(t.goal, value, entry.best_value):
        entry.best_value = value
        entry.best_at = _now()
    await session.commit()
    return entry


# --- jobs -------------------------------------------------------------------


async def run_tournament_jobs(session: AsyncSession) -> None:
    """Toutes les 30 min : rappel webhook 6 h avant la fin (FOMO ciblé sur
    les tickets restants) + annonce du podium à la clôture (feed de ligue)."""
    from app.services.notifications import notify
    from app.services.targets.base import GameEvent

    now = _now()
    tournaments = (
        (await session.execute(select(Tournament).options(_LOADED))).scalars().all()
    )
    for t in tournaments:
        if not t.reminder_sent and phase_of(t, now) == PHASE_LIVE and t.ends_at - now <= REMINDER_BEFORE:
            t.reminder_sent = True
            ranked = _leaderboard(t)
            leader = ranked[0].player.name if ranked else "personne"
            with_tickets = [
                e.player.name for e in t.entries if e.tickets_used < t.max_tickets
            ]
            await notify(
                session,
                GameEvent(
                    type="provocation",
                    data={
                        "by": t.title,
                        "target": None,
                        "story": (
                            f"dernières heures ! {leader} mène. "
                            f"Tickets restants : {', '.join(with_tickets) or 'aucun'}"
                        ),
                    },
                ),
            )
        if not t.closed_announced and phase_of(t, now) == PHASE_PAST:
            t.closed_announced = True
            ranked = _leaderboard(t)
            if ranked:
                podium = " · ".join(
                    f"{['🥇','🥈','🥉'][i]} {e.player.display_name or e.player.name}"
                    for i, e in enumerate(ranked[:3])
                )
                session.add(
                    LeagueEvent(
                        league_id=t.league_id,
                        event_type="TOURNAMENT_END",
                        actor_id=ranked[0].player_id,
                        story_text=f"{t.title} est terminé ! {podium}",
                    )
                )
    await session.commit()
