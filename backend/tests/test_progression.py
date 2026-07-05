"""Ferveur XP + daily streak with weekend freeze (Epics 7.3 / 7.5)."""

from datetime import date

from app.services.progression import advance_streak, effective_streak, level_for_xp, xp_for_game

# 2026 calendar: Jan 1 = Thursday, Jan 2 = Friday, Jan 5 = Monday.
THU = date(2026, 1, 1)
FRI = date(2026, 1, 2)
SAT = date(2026, 1, 3)
SUN = date(2026, 1, 4)
MON = date(2026, 1, 5)
TUE = date(2026, 1, 6)
WED = date(2026, 1, 7)


def test_streak_starts_at_one():
    assert advance_streak(None, 0, MON) == 1


def test_streak_same_day_no_double_count():
    assert advance_streak(MON, 3, MON) == 3


def test_streak_consecutive_days_increment():
    assert advance_streak(MON, 3, TUE) == 4


def test_streak_weekend_freeze_friday_to_monday():
    assert advance_streak(FRI, 5, MON) == 6


def test_streak_weekend_games_still_count():
    assert advance_streak(FRI, 5, SAT) == 6
    assert advance_streak(SAT, 6, SUN) == 7
    assert advance_streak(SUN, 7, MON) == 8


def test_streak_breaks_over_a_working_day():
    assert advance_streak(MON, 5, WED) == 1  # skipped Tuesday
    assert advance_streak(THU, 5, MON) == 1  # skipped Friday


def test_effective_streak_alive_and_broken():
    # Friday streak read on Monday: still alive (weekend freeze).
    assert effective_streak(FRI, 5, MON) == 5
    # Monday streak read on Wednesday: dead.
    assert effective_streak(MON, 5, WED) == 0
    assert effective_streak(None, 0, MON) == 0


def test_xp_formula():
    # (50 + 30 + 20*2) * 1.1 (streak 1) = 132
    assert xp_for_game(True, 20, 1) == 132
    # Defeat, no dart data, streak 0 -> flat 50.
    assert xp_for_game(False, 0, 0) == 50
    # Streak bonus caps at x2.
    assert xp_for_game(False, 0, 25) == 100


def test_levels_monotonic():
    assert level_for_xp(0) == 1
    assert level_for_xp(99) == 1
    assert level_for_xp(100) == 2
    assert level_for_xp(400) == 3
    assert level_for_xp(400) <= level_for_xp(2000)


async def test_game_awards_xp_and_streak(client):
    resp = await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    alice = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    await client.post(
        "/games",
        json={
            "date": "2026-07-03T10:00:00Z",  # a Friday
            "mode": "Cricket",
            "players": ["Alice", "Bob"],
            "scores": [20, 10],
            "winner": "Alice",
            "extra": {"darts": {"Alice": 21, "Bob": 18}},
        },
    )
    me = (await client.get("/players/me", headers=alice)).json()
    # (50 + 30 + 21*2) * 1.1 = 134
    assert me["ferveur_xp"] == 134
    assert me["ferveur_level"] == 2

    board = (await client.get("/stats/leaderboard")).json()
    alice_row = next(r for r in board if r["name"] == "Alice")
    bob_row = next(r for r in board if r["name"] == "Bob")
    assert alice_row["ferveur_xp"] == 134
    # Bob lost, no victory bonus: (50 + 18*2) * 1.1 = 95
    assert bob_row["ferveur_xp"] == 95
