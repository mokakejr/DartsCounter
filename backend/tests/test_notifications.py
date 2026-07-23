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
    card = body["cardsV2"][0]["card"]
    assert "Alice" in card["header"]["title"]
    assert "Cricket" in card["header"]["title"]


async def test_game_finished_notification_includes_elo_delta(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    resp = await client.post("/games", json=GAME)
    assert resp.status_code == 201

    _, body = fake_httpx.calls[0]
    card = body["cardsV2"][0]["card"]
    score_lines = card["sections"][0]["widgets"][0]["textParagraph"]["text"]
    assert "Alice" in score_lines and "Bob" in score_lines
    assert "(+" in score_lines
    assert "(-" in score_lines


async def test_game_finished_ranks_by_score_desc_not_submission_order(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    # Bob (winner, 300) submitted last, Carol (100) before Dave (200): the
    # podium must come out Bob, Dave, Carol regardless of payload order.
    resp = await client.post("/games", json={
        **GAME,
        "players": ["Carol", "Dave", "Bob"],
        "scores": [100, 200, 300],
        "winner": "Bob",
    })
    assert resp.status_code == 201

    _, body = fake_httpx.calls[0]
    score_lines = body["cardsV2"][0]["card"]["sections"][0]["widgets"][0]["textParagraph"]["text"]
    lines = score_lines.split("\n")
    assert "Bob" in lines[0] and lines[0].startswith("🥇")
    assert "Dave" in lines[1] and lines[1].startswith("🥈")
    assert "Carol" in lines[2] and lines[2].startswith("🥉")


async def test_game_finished_cutthroat_ranks_by_score_asc(client, fake_httpx):
    from app.core.db import async_session
    from app.services.elo_config import create_score_direction

    # Tests build the schema with create_all, not Alembic, so the migration
    # that seeds Cricket/CutThroat -> lower_is_better is not applied here.
    async with async_session() as session:
        await create_score_direction(session, "Cricket", "Cut Throat", True)

    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    # Cut Throat: lowest score wins — Stevy (200) must rank 3rd, behind
    # Léo (150), even though 200 would be 2nd in a normal game.
    resp = await client.post("/games", json={
        **GAME,
        "variant": "CutThroat",
        "players": ["Théo", "Stevy", "Léo"],
        "scores": [50, 200, 150],
        "winner": "Théo",
    })
    assert resp.status_code == 201

    _, body = fake_httpx.calls[0]
    score_lines = body["cardsV2"][0]["card"]["sections"][0]["widgets"][0]["textParagraph"]["text"]
    lines = score_lines.split("\n")
    assert "Théo" in lines[0] and lines[0].startswith("🥇")
    assert "Léo" in lines[1] and lines[1].startswith("🥈")
    assert "Stevy" in lines[2] and lines[2].startswith("🥉")


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
    card = body["cardsV2"][0]["card"]
    assert "Égalité" in card["header"]["title"]


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


# ─── Annonce de toutes les parties (fix du silence post-#86) ─────────────────

async def _auth(client, name):
    resp = await client.post("/auth/signup", json={"name": name, "password": "hunter22"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_casual_game_is_announced_without_elo(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    resp = await client.post("/games", json={**GAME, "is_casual": True})
    assert resp.status_code == 201

    assert len(fake_httpx.calls) == 1
    _, body = fake_httpx.calls[0]
    score_lines = body["cardsV2"][0]["card"]["sections"][0]["widgets"][0]["textParagraph"]["text"]
    # Hors classement : pas de deltas Elo dans la carte.
    assert "Alice" in score_lines
    assert "(+" not in score_lines


async def test_solo_training_game_not_announced(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    # Un entraînement solo (Bob27, 1 joueur) ne doit déclencher aucun webhook.
    resp = await client.post("/games", json={
        **GAME, "mode": "Bob27", "variant": None,
        "players": ["Alice"], "scores": [27], "winner": "Alice", "is_casual": True,
    })
    assert resp.status_code == 201
    assert fake_httpx.calls == []


async def test_pending_review_game_is_announced_with_mention(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    # Historique stable ~40 pts, puis une perf aberrante → gel anticheat.
    for i in range(10):
        await client.post("/games", json={
            **GAME, "mode": "Shanghai", "variant": None,
            "date": f"2026-01-{i + 1:02d}T10:00:00Z",
            "scores": [40 + (i % 3), 38],
        })
    fake_httpx.calls = []

    resp = await client.post("/games", json={
        **GAME, "mode": "Shanghai", "variant": None,
        "date": "2026-02-01T10:00:00Z", "scores": [400, 38],
    })
    assert resp.json()["status"] == "PENDING_REVIEW"

    assert len(fake_httpx.calls) == 1
    _, body = fake_httpx.calls[0]
    assert "homologation" in body["cardsV2"][0]["card"]["header"]["subtitle"]


def test_builders_pending_review_mention():
    from app.services.targets.discord import _game_finished_body as discord_body
    from app.services.targets.google_chat import _game_finished_body as gchat_body

    data = {
        "mode": "Cricket", "players": ["A", "B"], "scores": [10, 5],
        "winner": "A", "duration": 60, "status": "PENDING_REVIEW",
    }
    assert "homologation" in gchat_body(data)["cardsV2"][0]["card"]["header"]["subtitle"]
    assert any("homologation" in f["value"] for f in discord_body(data)["embeds"][0]["fields"])

    data["status"] = "COMPLETED"
    assert "homologation" not in gchat_body(data)["cardsV2"][0]["card"]["header"]["subtitle"]
    assert not any("homologation" in f["value"] for f in discord_body(data)["embeds"][0]["fields"])


async def test_no_targets_at_all_logs_warning(client, fake_httpx, caplog):
    import logging

    with caplog.at_level(logging.WARNING, logger="app.services.notifications"):
        resp = await client.post("/games", json=GAME)
        assert resp.status_code == 201

    assert fake_httpx.calls == []
    assert any("No webhook targets configured" in r.message for r in caplog.records)


# ─── Routage par ligue ───────────────────────────────────────────────────────

async def test_league_webhook_routes_and_skips_global(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/global"})
    alice = await _auth(client, "Alice")
    league = (await client.post("/leagues", json={"name": "CONNECTED PRODUCTS"}, headers=alice)).json()

    resp = await client.patch(
        f"/leagues/{league['id']}/webhook",
        json={"webhook_url": "https://chat.example/league"},
        headers=alice,
    )
    assert resp.status_code == 200
    assert resp.json()["webhook_url"] == "https://chat.example/league"

    await client.post("/games", json=GAME)  # Alice est membre actif

    # Dès qu'une ligue a un webhook, game_finished ne part plus sur le global.
    assert [u for u, _ in fake_httpx.calls] == ["https://chat.example/league"]


async def test_no_league_match_means_no_announcement(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/global"})
    alice = await _auth(client, "Alice")
    league = (await client.post("/leagues", json={"name": "Ligue A"}, headers=alice)).json()
    await client.patch(
        f"/leagues/{league['id']}/webhook",
        json={"webhook_url": "https://chat.example/league"},
        headers=alice,
    )

    # Partie entre deux non-membres : aucun webhook (ni ligue, ni global).
    await client.post("/games", json={**GAME, "players": ["Carol", "Dave"], "winner": "Carol"})
    assert fake_httpx.calls == []


async def test_two_leagues_same_url_announce_once(client, fake_httpx):
    alice = await _auth(client, "Alice")
    for name in ("Ligue A", "Ligue B"):
        league = (await client.post("/leagues", json={"name": name}, headers=alice)).json()
        await client.patch(
            f"/leagues/{league['id']}/webhook",
            json={"webhook_url": "https://chat.example/shared"},
            headers=alice,
        )

    await client.post("/games", json=GAME)
    assert len(fake_httpx.calls) == 1


async def test_weekly_recap_stays_on_global_targets(client, fake_httpx):
    await client.post("/webhooks", json={"target": "discord", "url": "https://discord.example/x"})
    alice = await _auth(client, "Alice")
    league = (await client.post("/leagues", json={"name": "Ligue A"}, headers=alice)).json()
    await client.patch(
        f"/leagues/{league['id']}/webhook",
        json={"webhook_url": "https://chat.example/league"},
        headers=alice,
    )

    today = datetime.now(timezone.utc).isoformat()
    await client.post("/games", json={**GAME, "date": today})
    fake_httpx.calls = []

    from app.workers.scheduler import send_weekly_recap

    await send_weekly_recap()

    # Le récap hebdo reste sur le canal global, pas sur les webhooks de ligue.
    assert [u for u, _ in fake_httpx.calls] == ["https://discord.example/x"]
