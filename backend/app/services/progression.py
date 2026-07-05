"""Ferveur XP + daily play streak (Epics 7.3 / 7.5).

Streak model: consecutive *days with at least one game*, office-rhythm aware —
weekends are a freeze period, never a break (a Friday player whose next game
is Monday keeps the streak). The break is derived at read time from
last_streak_update, so no nightly reset cron is needed.
"""

from datetime import date, timedelta, datetime
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")

# Streak multiplier: +10% per streak day, capped at x2.
_STREAK_BONUS_PER_DAY = 0.1
_STREAK_BONUS_CAP = 10


def _gap_ok(last: date, today: date) -> bool:
    """True if `today` continues a streak whose last active day is `last`:
    the very next day, or any span whose intermediate days are all weekend."""
    delta = (today - last).days
    if delta <= 0:
        return False
    if delta == 1:
        return True
    return all((last + timedelta(days=d)).weekday() >= 5 for d in range(1, delta))


def advance_streak(last: date | None, streak: int, today: date) -> int:
    """New streak value after playing on `today`."""
    if last is None or streak <= 0:
        return 1
    if last == today:
        return streak
    if _gap_ok(last, today):
        return streak + 1
    return 1


def effective_streak(last: date | None, streak: int, today: date) -> int:
    """What the streak is worth right now: unchanged while the chain can
    still be continued today, zero once it's broken."""
    if last is None:
        return 0
    if last == today or _gap_ok(last, today):
        return streak
    return 0


def xp_for_game(is_victory: bool, darts_total: int, streak: int) -> int:
    """Epic 7.3: (50 + 30*victory + darts*2) * streak multiplier."""
    base = 50 + (30 if is_victory else 0) + darts_total * 2
    multiplier = 1 + _STREAK_BONUS_PER_DAY * min(max(streak, 0), _STREAK_BONUS_CAP)
    return round(base * multiplier)


def level_for_xp(xp: int) -> int:
    # ponytail: quadratic curve (level n needs n^2*100 XP) — swap for a
    # hand-tuned table if progression pacing ever needs design attention.
    return int((max(xp, 0) / 100) ** 0.5) + 1


def paris_date(dt: datetime | None = None) -> date:
    return (dt or datetime.now(PARIS)).astimezone(PARIS).date()


def apply_game_to_player(player, game_date: datetime, is_victory: bool, darts_total: int = 0) -> None:
    """Mutates the Player ORM row in place; caller commits."""
    today = paris_date(game_date)
    last = paris_date(player.last_streak_update) if player.last_streak_update else None
    new_streak = advance_streak(last, player.current_streak, today)
    player.ferveur_xp = (player.ferveur_xp or 0) + xp_for_game(is_victory, darts_total, new_streak)
    player.ferveur_level = level_for_xp(player.ferveur_xp)
    player.current_streak = new_streak
    player.last_streak_update = game_date
