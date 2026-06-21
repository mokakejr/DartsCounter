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


def setup_jobs() -> None:
    scheduler.add_job(
        send_weekly_recap,
        CronTrigger(day_of_week="fri", hour=17, minute=0, timezone=PARIS),
        id="weekly_recap",
        replace_existing=True,
    )
