from datetime import datetime, timedelta, timezone

from app.services.recap import summarize_week
from app.workers.scheduler import _week_bounds

GAME = {
    "date": "2026-01-01T10:00:00Z",
    "mode": "Cricket",
    "variant": "Normal",
    "duration": 120,
    "players": ["Alice", "Bob"],
    "scores": [10, 20],
    "winner": "Alice",
}


async def test_game_finished_notification_dispatched(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    resp = await client.post("/games", json=GAME)
    assert resp.status_code == 201

    assert len(fake_httpx.calls) == 1
    url, body = fake_httpx.calls[0]
    assert url == "https://chat.example/x"
    assert "Alice" in body["text"]
    assert "Cricket" in body["text"]


async def test_idempotent_retry_does_not_renotify(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})
    payload = {**GAME, "id": "22222222-2222-2222-2222-222222222222"}

    await client.post("/games", json=payload)
    await client.post("/games", json=payload)

    assert len(fake_httpx.calls) == 1


async def test_tie_game_sends_egalite_message(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    resp = await client.post("/games", json={**GAME, "winner": None})
    assert resp.status_code == 201

    _, body = fake_httpx.calls[0]
    assert "Égalité" in body["text"]


def test_week_bounds_starts_on_monday():
    friday = datetime(2026, 6, 19, 17, 0)  # a Friday
    monday, end = _week_bounds(friday)
    assert monday.weekday() == 0
    assert monday.date() == (friday - timedelta(days=4)).date()
    assert end == friday


def test_summarize_week_empty():
    summary = summarize_week([])
    assert summary.is_empty
    assert summary.total_games == 0


def test_summarize_week_ranks_by_wins():
    games = [
        {"mode": "Cricket", "variant": "Normal", "players": ["Alice", "Bob"], "winner": "Alice", "duration": 100},
        {"mode": "Cricket", "variant": "Normal", "players": ["Alice", "Bob"], "winner": "Alice", "duration": 200},
        {"mode": "FiftyOne", "variant": "Normal", "players": ["Alice", "Bob"], "winner": "Bob", "duration": 50},
    ]
    summary = summarize_week(games)
    assert not summary.is_empty
    assert summary.total_games == 3
    assert summary.total_seconds == 350
    assert summary.ranking[0].name == "Alice"
    assert summary.ranking[0].wins == 2
    assert summary.longest["duration"] == 200
    assert summary.shortest["duration"] == 50


async def test_weekly_recap_dispatches_to_configured_target(client, fake_httpx):
    await client.post("/webhooks", json={"target": "discord", "url": "https://discord.example/x"})
    # Date must fall within "this week" for send_weekly_recap's date filter to pick it up.
    today = datetime.now(timezone.utc).isoformat()
    await client.post("/games", json={**GAME, "date": today})
    fake_httpx.calls = []  # drop the game_finished call triggered above

    from app.workers.scheduler import send_weekly_recap

    await send_weekly_recap()

    assert len(fake_httpx.calls) == 1
    url, body = fake_httpx.calls[0]
    assert url == "https://discord.example/x"
    embed = body["embeds"][0]
    assert embed["title"] == "🎯 Récap de la semaine"
    assert "Alice" in embed["fields"][0]["value"]  # classement
    assert "Cricket" in embed["fields"][1]["value"]  # en chiffres
