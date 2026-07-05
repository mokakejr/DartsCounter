"""Port of the old .github/workflows/weekly-recap.yml cron (Friday 17h
France) — now reading from Postgres instead of a checked-out games.json, and
using a real Europe/Paris-aware trigger instead of a fixed UTC offset (which
drifted an hour outside CEST).
"""

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import get_settings
from app.core.db import async_session
from app.services.games import list_games_between
from app.services.notifications import notify
from app.services.recap import fr_date_label
from app.services.targets.base import GameEvent

logger = logging.getLogger(__name__)

PARIS = ZoneInfo("Europe/Paris")
scheduler = AsyncIOScheduler(timezone=PARIS)


def _week_bounds(now: datetime) -> tuple[datetime, datetime]:
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday, now


async def send_weekly_recap() -> None:
    now = datetime.now(PARIS)
    start, end = _week_bounds(now)
    settings = get_settings()

    async with async_session() as session:
        games = await list_games_between(session, start, end)
        event = GameEvent(
            type="weekly_recap",
            data={
                "games": [
                    {
                        "mode": g.mode,
                        "variant": g.variant,
                        "players": [p.name for p in g.players],
                        "winner": g.winner,
                        "duration": g.duration,
                    }
                    for g in games
                ],
                "from_label": fr_date_label(start),
                "to_label": fr_date_label(end),
                "dashboard_url": settings.dashboard_url,
            },
        )
        await notify(session, event)

    logger.info("Weekly recap sent (%d games between %s and %s)", len(games), start, end)


async def run_ownership_inheritance() -> None:
    from app.services.leagues import run_ownership_inheritance as _run

    async with async_session() as session:
        transferred = await _run(session)
    if transferred:
        logger.info("Ownership inheritance: %d league(s) transferred", transferred)


async def run_league_maintenance() -> None:
    """Nightly: purge 30-day-old feed events (Pantheon records are exempt —
    separate table) and refresh the Pantheon pillars."""
    from app.services.league_events import evaluate_pantheon, purge_expired_events

    async with async_session() as session:
        purged = await purge_expired_events(session)
        await evaluate_pantheon(session)
    logger.info("League maintenance: %d expired feed event(s) purged", purged)


def purge_live_matches() -> None:
    from app.services.live import purge_expired

    purged = purge_expired()
    if purged:
        logger.info("Live matches: %d expired room(s) purged", purged)


async def close_stale_live_matches() -> None:
    from app.services.live import close_stale_matches

    closed = await close_stale_matches()
    if closed:
        logger.info("Live matches: %d stale match(es) auto-closed (15 min idle)", closed)


async def run_season_rollover() -> None:
    from app.services.seasons import rollover_if_needed

    async with async_session() as session:
        await rollover_if_needed(session)


async def run_tournament_maintenance() -> None:
    from app.services.tournaments import run_tournament_jobs

    async with async_session() as session:
        await run_tournament_jobs(session)


def setup_jobs() -> None:
    scheduler.add_job(
        run_season_rollover,
        CronTrigger(hour=5, minute=0, timezone=PARIS),
        id="season_rollover",
        replace_existing=True,
    )
    scheduler.add_job(
        run_tournament_maintenance,
        CronTrigger(minute="*/30", timezone=PARIS),
        id="tournament_maintenance",
        replace_existing=True,
    )
    scheduler.add_job(
        purge_live_matches,
        CronTrigger(minute="*/30", timezone=PARIS),
        id="live_matches_purge",
        replace_existing=True,
    )
    scheduler.add_job(
        close_stale_live_matches,
        CronTrigger(minute="*/2", timezone=PARIS),
        id="live_matches_stale",
        replace_existing=True,
    )
    scheduler.add_job(
        send_weekly_recap,
        CronTrigger(day_of_week="fri", hour=17, minute=0, timezone=PARIS),
        id="weekly_recap",
        replace_existing=True,
    )
    scheduler.add_job(
        run_ownership_inheritance,
        CronTrigger(hour=4, minute=30, timezone=PARIS),
        id="ownership_inheritance",
        replace_existing=True,
    )
    scheduler.add_job(
        run_league_maintenance,
        CronTrigger(hour=4, minute=0, timezone=PARIS),
        id="league_maintenance",
        replace_existing=True,
    )
