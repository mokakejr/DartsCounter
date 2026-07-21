"""Le Journal de Bord (Epic 9): automated rivalry storytelling.

Events are generated in the game-finished background task (never inline in
the request), read via their own indexed table (no joins on games), purged
after 30 days by the nightly job. The Pantheon (9.3) keeps permanent records.

Anti-toxicity (9.4): no negative event targets a player who already lost 3+
games today, and a player ending a losing streak by beating a higher-ranked
opponent gets a PHENIX story instead of yet another stat line.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Game, GamePlayer, League, LeagueEvent, LeagueMember, LeaguePantheon, Player
from app.models.game import STATUS_COMPLETED
from app.models.league_event import (
    EVENT_CLEAN_SWEEP,
    EVENT_PHENIX,
    EVENT_STREAK_BROKEN,
    EVENT_USURPATION,
    PILLAR_REGNE,
    PILLAR_REGNE_CURRENT,
    PILLAR_STAKHANOVISTE,
    PILLAR_TUEUR,
    PUBLIC_PILLARS,
)
from app.schemas.game import GameRead
from app.services.progression import paris_date

logger = logging.getLogger(__name__)

EVENT_TTL_DAYS = 30
LOSS_STREAK_FOR_PHENIX = 3
WIN_STREAK_WORTH_BREAKING = 3
MAX_DAILY_LOSSES_BEFORE_SILENCE = 3


def _display(p: Player) -> str:
    return p.display_name or p.name


# --- streak helpers over the raw chronological game list -------------------


def _win_streak_before(all_games: list[dict], player: str, game_id: str) -> int:
    """Consecutive wins of `player` immediately before `game_id` (wins > 0,
    losses reset). all_games is chronological."""
    streak = 0
    for g in all_games:
        if g["id"] == game_id:
            break
        if player not in g["players"]:
            continue
        streak = streak + 1 if g["winner"] == player else 0
    return streak


def _loss_streak_before(all_games: list[dict], player: str, game_id: str) -> int:
    streak = 0
    for g in all_games:
        if g["id"] == game_id:
            break
        if player not in g["players"]:
            continue
        streak = 0 if g["winner"] == player else streak + 1
    return streak


def _losses_today(all_games: list[dict], player: str, day) -> int:
    n = 0
    for g in all_games:
        if player in g["players"] and g["winner"] not in (player, None):
            if paris_date(datetime.fromisoformat(g["date"])) == day:
                n += 1
    return n


# --- event generation -------------------------------------------------------


async def _leagues_of_players(session: AsyncSession, player_ids: list[uuid.UUID]) -> list[League]:
    stmt = (
        select(League)
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .where(LeagueMember.player_id.in_(player_ids), LeagueMember.is_active.is_(True))
        .options(selectinload(League.memberships))
        .distinct()
    )
    return list((await session.execute(stmt)).scalars().all())


async def generate_events_for_game(
    session: AsyncSession,
    game: GameRead,
    all_games: list[dict],
    elo_by_player: dict[str, dict],
    players_by_name: dict[str, Player],
) -> int:
    """Writes feed events for every league containing the winner. Returns the
    number of events written. Failures must never break the caller (it runs
    in the notification background task)."""
    if game.winner is None or game.winner not in players_by_name:
        return 0
    winner = players_by_name[game.winner]
    losers = [p.name for p in game.players if p.name != game.winner]
    day = paris_date(game.date)

    leagues = await _leagues_of_players(session, [winner.id])
    if not leagues:
        return 0

    events: list[tuple[str, Player, Player | None, str]] = []  # (type, actor, target, story)

    # PHENIX — inversion of polarity: the past losing streak is the story.
    winner_losses = _loss_streak_before(all_games, game.winner, str(game.id))
    winner_elo = (elo_by_player.get(game.winner) or {}).get("before")
    phenix = False
    if winner_losses >= LOSS_STREAK_FOR_PHENIX and winner_elo is not None:
        for loser_name in losers:
            loser_elo = (elo_by_player.get(loser_name) or {}).get("before")
            if loser_elo is not None and loser_elo > winner_elo:
                loser = players_by_name[loser_name]
                events.append((
                    EVENT_PHENIX,
                    winner,
                    loser,
                    f"{_display(winner)} met fin à sa série noire en terrassant {_display(loser)} !",
                ))
                phenix = True
                break

    for loser_name in losers:
        loser = players_by_name.get(loser_name)
        if loser is None:
            continue
        # Anti-toxicity: never pile onto someone already having a bad day.
        if _losses_today(all_games, loser_name, day) >= MAX_DAILY_LOSSES_BEFORE_SILENCE:
            continue

        loser_gp = next(p for p in game.players if p.name == loser_name)
        if loser_gp.score == 0:
            events.append((
                EVENT_CLEAN_SWEEP,
                winner,
                loser,
                f"{_display(winner)} ne laisse aucun point à {_display(loser)}. Le contrat est rempli.",
            ))

        if not phenix and _win_streak_before(all_games, loser_name, str(game.id)) >= WIN_STREAK_WORTH_BREAKING:
            events.append((
                EVENT_STREAK_BROKEN,
                winner,
                loser,
                f"{_display(winner)} brise la série de {_display(loser)} en pleine gloire !",
            ))

    # USURPATION — the winner takes the league's #1 Elo spot from someone.
    usurped = _usurpation_target(elo_by_player, game.winner, players_by_name)
    if usurped is not None:
        events.append((
            EVENT_USURPATION,
            winner,
            usurped,
            f"COUP D'ÉTAT ! {_display(winner)} détrône {_display(usurped)} et prend la tête.",
        ))

    written = 0
    member_ids_by_league = {
        league.id: {m.player_id for m in league.memberships if m.is_active} for league in leagues
    }
    for league in leagues:
        members = member_ids_by_league[league.id]
        for event_type, actor, target, story in events:
            if target is not None and target.id not in members:
                continue  # rivalry stories only make sense inside a shared league
            session.add(
                LeagueEvent(
                    league_id=league.id,
                    event_type=event_type,
                    actor_id=actor.id,
                    target_id=target.id if target else None,
                    story_text=story,
                )
            )
            written += 1
    if written:
        await session.commit()
    return written


def _usurpation_target(
    elo_by_player: dict[str, dict], winner_name: str, players_by_name: dict[str, Player]
) -> Player | None:
    """Within this game's participants: the winner overtook a previously
    better-rated opponent. (League-wide throne tracking is the Pantheon's
    REGNE job — here a direct dethroning between the two players involved.)"""
    w = elo_by_player.get(winner_name)
    if not w:
        return None
    for name, elo in elo_by_player.items():
        if name == winner_name or name not in players_by_name:
            continue
        if elo["before"] > w["before"] and elo["after"] < w["after"]:
            return players_by_name[name]
    return None


# --- reads ------------------------------------------------------------------


async def list_events(
    session: AsyncSession, league_id: uuid.UUID, limit: int = 50, offset: int = 0
) -> list[LeagueEvent]:
    stmt = (
        select(LeagueEvent)
        .where(LeagueEvent.league_id == league_id)
        .options(selectinload(LeagueEvent.actor), selectinload(LeagueEvent.target))
        .order_by(LeagueEvent.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list((await session.execute(stmt)).scalars().all())


async def add_respect(session: AsyncSession, event: LeagueEvent) -> None:
    """+1 respect, +5 ferveur to both protagonists. ponytail: no per-user
    dedup — add a respects table if spam ever becomes a thing."""
    event.respect_count += 1
    for pid in (event.actor_id, event.target_id):
        if pid is None:
            continue
        player = await session.get(Player, pid)
        if player is not None:
            player.ferveur_xp = (player.ferveur_xp or 0) + 5
    await session.commit()


# --- pantheon + nightly maintenance ----------------------------------------


async def _upsert_pillar(
    session: AsyncSession, league_id: uuid.UUID, pillar: str, holder_id: uuid.UUID, value: int
) -> None:
    row = await session.get(LeaguePantheon, (league_id, pillar))
    if row is None:
        session.add(LeaguePantheon(league_id=league_id, pillar=pillar, holder_id=holder_id, value=value))
    elif value > row.value or pillar == PILLAR_REGNE_CURRENT:
        row.holder_id = holder_id
        row.value = value
        row.achieved_at = func.now()


async def evaluate_pantheon(session: AsyncSession) -> None:
    """Nightly: recompute record pillars per league from game history, and
    advance the running "days as champion" counter."""
    leagues = (
        (await session.execute(select(League).options(selectinload(League.memberships)))).scalars().all()
    )
    for league in leagues:
        member_ids = [m.player_id for m in league.memberships if m.is_active]
        if not member_ids:
            continue

        # STAKHANOVISTE — most completed games.
        stmt = (
            select(GamePlayer.player_id, func.count().label("n"))
            .join(Game, Game.id == GamePlayer.game_id)
            .where(
                GamePlayer.player_id.in_(member_ids),
                Game.is_casual.is_(False),
                Game.status == STATUS_COMPLETED,
            )
            .group_by(GamePlayer.player_id)
            .order_by(func.count().desc())
            .limit(1)
        )
        row = (await session.execute(stmt)).first()
        if row:
            await _upsert_pillar(session, league.id, PILLAR_STAKHANOVISTE, row.player_id, row.n)

        # TUEUR À GAGES — most wins where an opponent finished at 0.
        loser = GamePlayer.__table__.alias("loser")
        stmt = (
            select(Game.winner_id, func.count().label("n"))
            .join(loser, loser.c.game_id == Game.id)
            .where(
                Game.winner_id.in_(member_ids),
                Game.is_casual.is_(False),
                Game.status == STATUS_COMPLETED,
                loser.c.score == 0,
                loser.c.player_id != Game.winner_id,
            )
            .group_by(Game.winner_id)
            .order_by(func.count().desc())
            .limit(1)
        )
        row = (await session.execute(stmt)).first()
        if row and row.n > 0:
            await _upsert_pillar(session, league.id, PILLAR_TUEUR, row.winner_id, row.n)

        # RÈGNE ANCESTRAL — consecutive days as league Elo #1, advanced daily.
        from app.services.stats import get_leaderboard

        board = await get_leaderboard(session, league_id=league.id)
        active = [r for r in board if r.is_active and r.games > 0]
        if active:
            champion_id = active[0].id
            current = await session.get(LeaguePantheon, (league.id, PILLAR_REGNE_CURRENT))
            days = current.value + 1 if current is not None and current.holder_id == champion_id else 1
            await _upsert_pillar(session, league.id, PILLAR_REGNE_CURRENT, champion_id, days)
            await _upsert_pillar(session, league.id, PILLAR_REGNE, champion_id, days)

    await session.commit()


async def purge_expired_events(session: AsyncSession) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=EVENT_TTL_DAYS)
    result = await session.execute(delete(LeagueEvent).where(LeagueEvent.created_at < cutoff))
    await session.commit()
    return result.rowcount or 0


async def get_pantheon(session: AsyncSession, league_id: uuid.UUID) -> list[LeaguePantheon]:
    stmt = (
        select(LeaguePantheon)
        .where(LeaguePantheon.league_id == league_id, LeaguePantheon.pillar.in_(PUBLIC_PILLARS))
        .options(selectinload(LeaguePantheon.holder))
    )
    return list((await session.execute(stmt)).scalars().all())
