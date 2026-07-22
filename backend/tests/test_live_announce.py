"""Annonce « 🔴 LIVE » des matchs live (webhook + lien vers les gradins).

Le dispatch part en asyncio.create_task depuis le routeur (la création du
match ne bloque jamais sur le réseau) — les tests drainent les tasks du
loop avant d'inspecter fake_httpx.calls.
"""

import asyncio

import pytest

from app.services import live
from app.services.targets.discord import _live_started_body as discord_live_body
from app.services.targets.google_chat import _live_started_body as gchat_live_body


@pytest.fixture(autouse=True)
def _clean_registry():
    live.MATCHES.clear()
    yield
    live.MATCHES.clear()


async def _drain_tasks():
    """Attend la fin des tasks lancées par _maybe_announce."""
    for _ in range(10):
        pending = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        if not pending:
            return
        await asyncio.gather(*pending, return_exceptions=True)


async def _auth(client, name):
    resp = await client.post("/auth/signup", json={"name": name, "password": "hunter22"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ─── Builders ────────────────────────────────────────────────────────────────


def test_discord_embed_duel_vs_melee():
    data = {"mode": "Cricket", "players": ["Leo", "Theo"], "remote": False,
            "watch_url": "https://counter.example/watch/abc123"}
    body = discord_live_body(data)
    embed = body["embeds"][0]
    assert embed["title"] == "🔴 LIVE : Leo 🆚 Theo"
    assert embed["url"] == data["watch_url"]
    assert "REJOINDRE LES GRADINS" in embed["description"]

    melee = discord_live_body({**data, "players": ["Leo", "Theo", "Ana"]})
    assert melee["embeds"][0]["title"] == "🔴 LIVE : Mêlée à 3 — Leo, Theo, Ana"


def test_gchat_card_has_watch_button():
    data = {"mode": "Super Cricket", "players": ["Leo", "Theo"], "remote": True,
            "watch_url": "https://counter.example/watch/abc123"}
    card = gchat_live_body(data)["cardsV2"][0]["card"]
    assert card["header"]["title"] == "🔴 LIVE : Leo 🆚 Theo"
    assert "à distance" in card["header"]["subtitle"]
    button = card["sections"][0]["widgets"][0]["buttonList"]["buttons"][0]
    assert button["onClick"]["openLink"]["url"] == data["watch_url"]


# ─── Dispatch via les routes ─────────────────────────────────────────────────


async def test_local_create_announces_once(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    resp = await client.post(
        "/live/matches", json={"mode": "Cricket", "players": ["Leo", "Theo"]}
    )
    assert resp.status_code == 201
    match_id = resp.json()["id"]
    await _drain_tasks()

    assert len(fake_httpx.calls) == 1
    url, body = fake_httpx.calls[0]
    card = body["cardsV2"][0]["card"]
    assert card["header"]["title"] == "🔴 LIVE : Leo 🆚 Theo"
    watch_url = card["sections"][0]["widgets"][0]["buttonList"]["buttons"][0]["onClick"]["openLink"]["url"]
    assert watch_url.endswith(f"/watch/{match_id}")
    assert live.get_match(match_id).announced is True


async def test_solo_match_not_announced(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    resp = await client.post("/live/matches", json={"mode": "Bob27", "players": ["Leo"]})
    assert resp.status_code == 201
    await _drain_tasks()

    assert fake_httpx.calls == []
    assert live.get_match(resp.json()["id"]).announced is False


async def test_remote_announces_when_everyone_ready(client, fake_httpx):
    await client.post("/webhooks", json={"target": "discord", "url": "https://discord.com/api/webhooks/x"})

    resp = await client.post(
        "/live/matches", json={"mode": "51", "players": ["Leo", "Theo"], "remote": True}
    )
    match_id = resp.json()["id"]
    await _drain_tasks()
    assert fake_httpx.calls == []  # pas encore démarré : pas d'annonce

    await client.post(f"/live/matches/{match_id}/ready", json={"name": "Leo"})
    await client.post(f"/live/matches/{match_id}/ready", json={"name": "Theo"})
    # Un ready en trop (retry réseau) ne ré-annonce pas.
    await client.post(f"/live/matches/{match_id}/ready", json={"name": "Theo"})
    await _drain_tasks()

    assert len(fake_httpx.calls) == 1
    assert fake_httpx.calls[0][1]["embeds"][0]["title"] == "🔴 LIVE : Leo 🆚 Theo"


async def test_revived_match_does_not_reannounce(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})
    resp = await client.post("/live/matches", json={"mode": "Cricket", "players": ["Leo", "Theo"]})
    await _drain_tasks()
    assert len(fake_httpx.calls) == 1

    # Auto-clôture puis résurrection (pause café) : announced reste posé.
    match = live.get_match(resp.json()["id"])
    match.finished = True
    match.aborted = True
    live.apply_player_event(match, "Leo", {"event": "SCORE_UPDATED", "scores": {"Leo": 4}})
    assert match.finished is False
    assert match.announced is True  # le routeur garde ce flag : jamais ré-annoncé
    assert len(fake_httpx.calls) == 1


async def test_league_routing_for_live_announce(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/global"})
    alice = await _auth(client, "Alice")
    league = (await client.post("/leagues", json={"name": "Ligue A"}, headers=alice)).json()
    await client.patch(
        f"/leagues/{league['id']}/webhook",
        json={"webhook_url": "https://chat.example/league"},
        headers=alice,
    )

    # Alice est membre actif -> annonce sur le webhook de ligue, pas le global.
    await client.post("/live/matches", json={"mode": "Cricket", "players": ["Alice", "Bob"]})
    await _drain_tasks()
    assert [u for u, _ in fake_httpx.calls] == ["https://chat.example/league"]

    # Match entre non-membres : une ligue est configurée -> pas de repli global.
    fake_httpx.calls.clear()
    await client.post("/live/matches", json={"mode": "Cricket", "players": ["Carol", "Dave"]})
    await _drain_tasks()
    assert fake_httpx.calls == []
