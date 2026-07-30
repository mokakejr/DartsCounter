import asyncio
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlsplit

import pytest

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


# ─── Fil de discussion : début de partie + résultat en réponse ────────────────


LIVE_MATCH = {"mode": "Cricket", "players": ["Alice", "Bob"], "options": {"isCasual": False}}


@pytest.fixture
def instant_announce(monkeypatch):
    """Neutralise le délai anti-faux-départ pour que l'annonce parte tout de
    suite dans les tests."""
    monkeypatch.setattr("app.services.notifications.ANNOUNCE_DELAY_SECONDS", 0)


async def _start_live_match(client, body=None):
    resp = await client.post("/live/matches", json=body or LIVE_MATCH)
    assert resp.status_code == 201
    # L'annonce part dans une tâche de fond : on lui laisse la main.
    await asyncio.sleep(0.05)
    return resp.json()


def test_threaded_url_preserves_existing_query_params():
    from app.services.targets.google_chat import _threaded_url

    url = _threaded_url("https://chat.googleapis.com/v1/spaces/AAA/messages?key=k1&token=t1")
    parsed = dict(parse_qsl(urlsplit(url).query))
    assert parsed["key"] == "k1"
    assert parsed["token"] == "t1"
    assert parsed["messageReplyOption"] == "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD"


async def test_game_start_announced_with_watch_link(client, fake_httpx, instant_announce):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    match = await _start_live_match(client)

    assert len(fake_httpx.calls) == 1
    url, body = fake_httpx.calls[0]
    assert "messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD" in url
    assert body["thread"]["threadKey"]
    card = body["cardsV2"][0]["card"]
    assert "ÇA COMMENCE" in card["header"]["title"]
    assert "Alice vs Bob" in card["header"]["subtitle"]
    buttons = card["sections"][-1]["widgets"][-1]["buttonList"]["buttons"]
    assert buttons[0]["onClick"]["openLink"]["url"].endswith(f"/watch/{match['id']}")


async def test_result_is_posted_as_a_reply_in_the_game_thread(client, fake_httpx, instant_announce):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    match = await _start_live_match(client)
    _, start_body = fake_httpx.calls[0]

    resp = await client.post("/games", json={**GAME, "live_match_id": match["id"]})
    assert resp.status_code == 201

    assert len(fake_httpx.calls) == 2
    _, result_body = fake_httpx.calls[1]
    assert result_body["thread"]["threadKey"] == start_body["thread"]["threadKey"]


async def test_game_without_live_match_is_not_threaded(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    # Partie remontée par la file offline : aucun match live, donc aucun fil.
    resp = await client.post("/games", json=GAME)
    assert resp.status_code == 201

    url, body = fake_httpx.calls[0]
    assert "thread" not in body
    assert url == "https://chat.example/x"


async def test_rematch_within_the_window_reuses_the_thread():
    from app.services import chat_threads

    first = chat_threads.thread_key_for(["Alice", "Bob"], "match-1")
    # Revanche immédiate, joueurs identiques (ordre indifférent).
    assert chat_threads.thread_key_for(["Bob", "Alice"], "match-2") == first
    # Un autre plateau ouvre son propre fil.
    assert chat_threads.thread_key_for(["Alice", "Carol"], "match-3") != first


async def test_thread_is_not_reused_after_the_grouping_window():
    from app.services import chat_threads

    first = chat_threads.thread_key_for(["Alice", "Bob"], "match-1")
    entry = chat_threads._THREADS[frozenset({"Alice", "Bob"})]
    entry["last_activity"] -= chat_threads.GROUP_WINDOW_SECONDS + 1

    assert chat_threads.thread_key_for(["Alice", "Bob"], "match-2") != first


async def test_casual_and_solo_matches_are_not_announced(client, fake_httpx, instant_announce):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    await _start_live_match(client, {**LIVE_MATCH, "options": {"isCasual": True}})
    # Le front envoie le LIBELLÉ du mode au registre live, pas la clé en base.
    await _start_live_match(client, {"mode": "Bob's 27", "players": ["Alice", "Bob"]})
    await _start_live_match(client, {"mode": "Cricket", "players": ["Alice"]})

    assert fake_httpx.calls == []


async def test_false_start_is_never_announced(client, fake_httpx):
    from app.services import live
    from app.services.notifications import dispatch_game_started

    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})
    match = live.create_match("Cricket", ["Alice", "Bob"])

    async def finish_during_the_delay():
        await asyncio.sleep(0.01)
        match.finished = True
        match.aborted = True

    await asyncio.gather(dispatch_game_started(match, delay=0.05), finish_during_the_delay())

    assert fake_httpx.calls == []
    # La réservation est rendue : une reprise du jeu pourra encore annoncer.
    assert match.announced is False


async def test_abandoned_match_closes_its_thread(client, fake_httpx, instant_announce):
    from app.services import live
    from app.services.notifications import dispatch_game_abandoned

    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})
    match_id = (await _start_live_match(client))["id"]
    match = live.get_match(match_id)
    _, start_body = fake_httpx.calls[0]

    match.finished = True
    match.aborted = True
    await dispatch_game_abandoned(match)

    assert len(fake_httpx.calls) == 2
    _, body = fake_httpx.calls[1]
    assert "interrompue" in body["text"]
    assert body["thread"]["threadKey"] == start_body["thread"]["threadKey"]

    # Les trois chemins de clôture peuvent se déclencher (abandon explicite,
    # départ des joueurs, inactivité) : pas de doublon.
    await dispatch_game_abandoned(match)
    assert len(fake_httpx.calls) == 2


async def test_explicit_abort_over_the_socket_closes_the_thread(client, fake_httpx, instant_announce):
    """Le compteur émet MATCH_FINISHED{aborted:true} quand un joueur quitte
    l'écran de jeu — c'est le chemin d'abandon le plus courant."""
    from app.services import live
    from app.services.notifications import dispatch_game_abandoned

    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})
    match = live.get_match((await _start_live_match(client))["id"])

    live.apply_player_event(match, "Alice", {"event": "MATCH_FINISHED", "aborted": True})
    assert match.aborted is True
    await dispatch_game_abandoned(match)

    assert len(fake_httpx.calls) == 2
    assert "interrompue" in fake_httpx.calls[1][1]["text"]


async def test_abandon_is_silent_when_the_start_was_never_announced(client, fake_httpx):
    from app.services import live
    from app.services.notifications import dispatch_game_abandoned

    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})
    match = live.create_match("Cricket", ["Alice", "Bob"])

    await dispatch_game_abandoned(match)

    assert fake_httpx.calls == []


async def test_discord_only_posts_the_result(client, fake_httpx, instant_announce):
    await client.post("/webhooks", json={"target": "discord", "url": "https://discord.example/x"})

    match = await _start_live_match(client)
    assert fake_httpx.calls == []  # Discord ne sait pas répondre en fil : on n'annonce pas

    await client.post("/games", json={**GAME, "live_match_id": match["id"]})
    assert len(fake_httpx.calls) == 1
    _, body = fake_httpx.calls[0]
    assert "embeds" in body and "thread" not in body


async def test_rank_change_shown_on_the_result_card(client, fake_httpx):
    from app.services.targets.google_chat import _game_finished_body

    body = _game_finished_body({
        "mode": "Cricket",
        "players": ["Alice", "Bob"],
        "scores": [10, 20],
        "winner": "Alice",
        "duration": 120,
        "elo": {"Alice": {"before": 10182, "after": 10200, "delta": 18}},
        "rank_changes": {"Alice": {"rank": "Diamant I", "up": True}},
    })
    score_lines = body["cardsV2"][0]["card"]["sections"][0]["widgets"][0]["textParagraph"]["text"]
    assert "⬆️" in score_lines and "Diamant I" in score_lines
