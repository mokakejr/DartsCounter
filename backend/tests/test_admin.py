import pytest
from sqlalchemy import select

from app.core.db import async_session
from app.models import Player, WebhookTarget


async def _signup(client, name="Alice", password="hunter22"):
    resp = await client.post("/auth/signup", json={"name": name, "password": password})
    assert resp.status_code == 201, resp.text
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _make_admin(name: str) -> None:
    async with async_session() as session:
        player = (await session.execute(select(Player).where(Player.name == name))).scalar_one()
        player.is_admin = True
        await session.commit()


async def _create_game(client):
    payload = {
        "mode": "Cricket",
        "players": ["Alice", "Bob"],
        "scores": [301, 250],
        "winner": "Alice",
        "duration": 120,
        "date": "2026-01-01T12:00:00Z",
    }
    resp = await client.post("/games", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ─── Auth guards ──────────────────────────────────────────────────────────────

async def test_admin_logs_requires_auth(client):
    resp = await client.get("/admin/logs")
    assert resp.status_code == 401


async def test_admin_logs_rejects_non_admin(client):
    token = await _signup(client)
    resp = await client.get("/admin/logs", headers=_auth(token))
    assert resp.status_code == 403


async def test_admin_players_requires_admin(client):
    token = await _signup(client)
    resp = await client.get("/admin/players", headers=_auth(token))
    assert resp.status_code == 403


# ─── Logs ─────────────────────────────────────────────────────────────────────

async def test_admin_logs_empty_initially(client):
    token = await _signup(client)
    await _make_admin("Alice")
    resp = await client.get("/admin/logs", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json() == []


# ─── Games ────────────────────────────────────────────────────────────────────

async def test_delete_game_not_found(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    import uuid
    resp = await client.delete(f"/admin/games/{uuid.uuid4()}", headers=_auth(token))
    assert resp.status_code == 404


async def test_delete_game_removes_it_and_logs(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    await _signup(client, "Bob")

    game_id = await _create_game(client)

    resp = await client.delete(f"/admin/games/{game_id}", headers=_auth(token))
    assert resp.status_code == 204

    # Game is gone
    resp = await client.get("/games")
    assert all(g["id"] != game_id for g in resp.json())

    # Audit log was written
    logs = (await client.get("/admin/logs", headers=_auth(token))).json()
    assert any(l["action"] == "delete_game" and l["entity_id"] == game_id for l in logs)


# ─── ELO & Trophies ───────────────────────────────────────────────────────────

async def test_elo_recompute_via_admin(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    await _signup(client, "Bob")
    await _create_game(client)

    resp = await client.post("/admin/elo/recompute", headers=_auth(token))
    assert resp.status_code == 200
    assert "players_updated" in resp.json()

    logs = (await client.get("/admin/logs", headers=_auth(token))).json()
    assert any(l["action"] == "recompute_elo" for l in logs)


async def test_trophies_recompute(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    await _signup(client, "Bob")
    await _create_game(client)

    resp = await client.post("/admin/trophies/recompute", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert "total_unlocked" in body
    assert "by_achievement" in body

    logs = (await client.get("/admin/logs", headers=_auth(token))).json()
    assert any(l["action"] == "recompute_trophies" for l in logs)


# ─── Players ──────────────────────────────────────────────────────────────────

async def test_list_players(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    await _signup(client, "Bob")

    resp = await client.get("/admin/players", headers=_auth(token))
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert "Admin" in names
    assert "Bob" in names


async def test_list_players_shows_account_flag(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    await _signup(client, "Bob")

    players = (await client.get("/admin/players", headers=_auth(token))).json()
    admin_row = next(p for p in players if p["name"] == "Admin")
    assert admin_row["has_account"] is True
    assert admin_row["is_admin"] is True


async def test_reset_password(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    await _signup(client, "Bob")

    bob = next(
        p for p in (await client.get("/admin/players", headers=_auth(token))).json()
        if p["name"] == "Bob"
    )
    resp = await client.patch(
        f"/admin/players/{bob['id']}/password",
        json={"new_password": "newpass99"},
        headers=_auth(token),
    )
    assert resp.status_code == 204

    # Bob can now log in with the new password
    login = await client.post("/auth/login", json={"name": "Bob", "password": "newpass99"})
    assert login.status_code == 200

    logs = (await client.get("/admin/logs", headers=_auth(token))).json()
    assert any(l["action"] == "reset_password" for l in logs)


async def test_set_role(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    await _signup(client, "Bob")

    bob = next(
        p for p in (await client.get("/admin/players", headers=_auth(token))).json()
        if p["name"] == "Bob"
    )
    assert bob["is_admin"] is False

    resp = await client.patch(
        f"/admin/players/{bob['id']}/role",
        json={"is_admin": True},
        headers=_auth(token),
    )
    assert resp.status_code == 204

    bob_updated = next(
        p for p in (await client.get("/admin/players", headers=_auth(token))).json()
        if p["name"] == "Bob"
    )
    assert bob_updated["is_admin"] is True

    logs = (await client.get("/admin/logs", headers=_auth(token))).json()
    assert any(l["action"] == "set_role" for l in logs)


# ─── Webhooks ─────────────────────────────────────────────────────────────────

async def _create_webhook(client, token, target="google_chat"):
    resp = await client.post(
        "/webhooks",
        json={"target": target, "url": "https://example.com/hook", "enabled": True},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    return resp.json()


async def test_list_webhooks_admin(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    await _create_webhook(client, token)

    resp = await client.get("/admin/webhooks", headers=_auth(token))
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_toggle_webhook(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    wh = await _create_webhook(client, token)
    assert wh["enabled"] is True

    resp = await client.patch(f"/admin/webhooks/{wh['id']}/toggle", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False

    # Toggle back
    resp = await client.patch(f"/admin/webhooks/{wh['id']}/toggle", headers=_auth(token))
    assert resp.json()["enabled"] is True

    logs = (await client.get("/admin/logs", headers=_auth(token))).json()
    toggle_logs = [l for l in logs if l["action"] == "toggle_webhook"]
    assert len(toggle_logs) == 2


async def test_test_webhook(client, fake_httpx):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")
    wh = await _create_webhook(client, token)

    resp = await client.post(f"/admin/webhooks/{wh['id']}/test", headers=_auth(token))
    assert resp.status_code == 202
    assert resp.json()["status"] == "sent"
    assert len(fake_httpx.calls) == 1


# ─── Seasons ──────────────────────────────────────────────────────────────────

async def test_list_seasons_empty(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")

    resp = await client.get("/admin/seasons", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_season(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")

    resp = await client.post(
        "/admin/seasons",
        json={"name": "Saison 1", "start_date": "2026-01-01"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Saison 1"
    assert body["is_active"] is True

    logs = (await client.get("/admin/logs", headers=_auth(token))).json()
    assert any(l["action"] == "create_season" for l in logs)


async def test_create_season_closes_previous(client):
    token = await _signup(client, "Admin")
    await _make_admin("Admin")

    s1 = (await client.post(
        "/admin/seasons", json={"name": "S1"}, headers=_auth(token)
    )).json()
    assert s1["is_active"] is True

    s2 = (await client.post(
        "/admin/seasons", json={"name": "S2"}, headers=_auth(token)
    )).json()
    assert s2["is_active"] is True

    seasons = (await client.get("/admin/seasons", headers=_auth(token))).json()
    s1_updated = next(s for s in seasons if s["id"] == s1["id"])
    assert s1_updated["is_active"] is False
    assert s1_updated["end_date"] is not None
