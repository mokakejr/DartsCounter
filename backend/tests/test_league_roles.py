"""Roles, privacy levels, ghost members and ownership inheritance (Epic 3)."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.core.db import async_session
from app.models import League, Player
from app.services.leagues import run_ownership_inheritance


async def _signup(client, name):
    resp = await client.post("/auth/signup", json={"name": name, "password": "hunter22"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _me(client, headers):
    return (await client.get("/players/me", headers=headers)).json()


async def _create_league(client, headers, **extra):
    resp = await client.post("/leagues", json={"name": "Ligue du Bureau", **extra}, headers=headers)
    assert resp.status_code == 201
    return resp.json()


async def _join(client, headers, code):
    resp = await client.post("/leagues/join", json={"code": code}, headers=headers)
    assert resp.status_code == 200
    return resp.json()


def _member(league, name):
    return next(m for m in league["members"] if m["name"] == name)


async def test_creator_has_owner_role(client):
    alice = await _signup(client, "Alice")
    league = await _create_league(client, alice, motto="La cave des rois", icon="crown")
    assert league["motto"] == "La cave des rois"
    assert league["icon"] == "crown"
    assert league["privacy_level"] == "PRIVATE_CODE"
    assert _member(league, "Alice")["role"] == "owner"


async def test_owner_promotes_and_demotes_admin(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await _join(client, bob, league["invite_code"])
    bob_id = (await _me(client, bob))["id"]

    # Bob (member) can't promote himself.
    resp = await client.patch(
        f"/leagues/{league['id']}/members/{bob_id}/role", json={"role": "admin"}, headers=bob
    )
    assert resp.status_code == 403

    resp = await client.patch(
        f"/leagues/{league['id']}/members/{bob_id}/role", json={"role": "admin"}, headers=alice
    )
    assert resp.status_code == 200
    assert _member(resp.json(), "Bob")["role"] == "admin"


async def test_admin_can_kick_member_but_not_admin(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    carol = await _signup(client, "Carol")
    dave = await _signup(client, "Dave")
    league = await _create_league(client, alice)
    for h in (bob, carol, dave):
        await _join(client, h, league["invite_code"])
    bob_id = (await _me(client, bob))["id"]
    carol_id = (await _me(client, carol))["id"]
    dave_id = (await _me(client, dave))["id"]

    for pid in (bob_id, carol_id):
        await client.patch(
            f"/leagues/{league['id']}/members/{pid}/role", json={"role": "admin"}, headers=alice
        )

    # Admin kicks a plain member.
    resp = await client.delete(f"/leagues/{league['id']}/members/{dave_id}", headers=bob)
    assert resp.status_code == 204
    # Admin can't kick another admin — owner only.
    resp = await client.delete(f"/leagues/{league['id']}/members/{carol_id}", headers=bob)
    assert resp.status_code == 403
    resp = await client.delete(f"/leagues/{league['id']}/members/{carol_id}", headers=alice)
    assert resp.status_code == 204


async def test_leave_makes_ghost_not_delete(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await _join(client, bob, league["invite_code"])
    bob_id = (await _me(client, bob))["id"]

    resp = await client.delete(f"/leagues/{league['id']}/members/{bob_id}", headers=bob)
    assert resp.status_code == 204
    # Gone from Bob's leagues...
    assert (await client.get("/leagues/mine", headers=bob)).json() == []
    # ...but still visible to the owner as an inactive ghost, at the end.
    mine = (await client.get("/leagues/mine", headers=alice)).json()
    ghost = _member(mine[0], "Bob")
    assert ghost["is_active"] is False
    assert mine[0]["members"][-1]["name"] == "Bob"

    # Rejoining by code reactivates the same membership.
    league = await _join(client, bob, league["invite_code"])
    assert _member(league, "Bob")["is_active"] is True


async def test_ghost_listed_last_in_league_leaderboard(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await _join(client, bob, league["invite_code"])
    bob_id = (await _me(client, bob))["id"]
    await client.delete(f"/leagues/{league['id']}/members/{bob_id}", headers=bob)

    rows = (await client.get(f"/stats/leaderboard?league_id={league['id']}")).json()
    assert [r["name"] for r in rows] == ["Alice", "Bob"]
    assert rows[0]["is_active"] is True
    assert rows[1]["is_active"] is False


async def test_public_league_direct_join_and_directory(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice, privacy_level="PUBLIC")

    listing = (await client.get("/leagues/public", headers=bob)).json()
    assert [l["id"] for l in listing] == [league["id"]]
    assert "invite_code" not in listing[0]

    resp = await client.post(f"/leagues/{league['id']}/join", headers=bob)
    assert resp.status_code == 200
    assert {m["name"] for m in resp.json()["members"]} == {"Alice", "Bob"}


async def test_private_code_league_rejects_direct_join(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)  # PRIVATE_CODE default
    resp = await client.post(f"/leagues/{league['id']}/join", headers=bob)
    assert resp.status_code == 403


async def test_application_league_request_flow(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice, privacy_level="APPLICATION")
    bob_id = (await _me(client, bob))["id"]

    resp = await client.post(f"/leagues/{league['id']}/join", headers=bob)
    assert resp.status_code == 200
    assert resp.json() == {"status": "PENDING"}

    # Bob can't see or decide requests.
    assert (await client.get(f"/leagues/{league['id']}/requests", headers=bob)).status_code == 403

    requests = (await client.get(f"/leagues/{league['id']}/requests", headers=alice)).json()
    assert [r["name"] for r in requests] == ["Bob"]

    resp = await client.post(
        f"/leagues/{league['id']}/requests/{bob_id}", json={"action": "accept"}, headers=alice
    )
    assert resp.status_code == 200
    assert _member(resp.json(), "Bob")["is_active"] is True
    # Request consumed.
    assert (await client.get(f"/leagues/{league['id']}/requests", headers=alice)).json() == []


async def test_application_league_reject_allows_reapply(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice, privacy_level="APPLICATION")
    bob_id = (await _me(client, bob))["id"]

    await client.post(f"/leagues/{league['id']}/join", headers=bob)
    resp = await client.post(
        f"/leagues/{league['id']}/requests/{bob_id}", json={"action": "reject"}, headers=alice
    )
    assert resp.status_code == 200
    assert len(resp.json()["members"]) == 1

    # Re-apply flips the same row back to PENDING.
    await client.post(f"/leagues/{league['id']}/join", headers=bob)
    requests = (await client.get(f"/leagues/{league['id']}/requests", headers=alice)).json()
    assert [r["name"] for r in requests] == ["Bob"]


async def test_manual_ownership_transfer(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await _join(client, bob, league["invite_code"])
    bob_id = (await _me(client, bob))["id"]

    resp = await client.post(
        f"/leagues/{league['id']}/transfer", json={"player_id": bob_id}, headers=alice
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["owner_id"] == bob_id
    assert _member(body, "Bob")["role"] == "owner"
    assert _member(body, "Alice")["role"] == "admin"


async def _age_login(name: str, days: int) -> None:
    async with async_session() as session:
        await session.execute(
            update(Player)
            .where(Player.name == name)
            .values(last_login=datetime.now(timezone.utc) - timedelta(days=days))
        )
        await session.commit()


async def test_ownership_inheritance_prefers_recent_admin(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    carol = await _signup(client, "Carol")
    league = await _create_league(client, alice)
    await _join(client, bob, league["invite_code"])
    await _join(client, carol, league["invite_code"])
    bob_id = (await _me(client, bob))["id"]

    await client.patch(
        f"/leagues/{league['id']}/members/{bob_id}/role", json={"role": "admin"}, headers=alice
    )

    await _age_login("Alice", 45)  # absentee owner
    await _age_login("Bob", 5)  # admin, recently active
    await _age_login("Carol", 2)  # plain member, most active — still loses to the admin

    async with async_session() as session:
        assert await run_ownership_inheritance(session) == 1
        row = (await session.execute(select(League).where(League.id == uuid.UUID(league["id"])))).scalar_one()
        assert row.owner_id == uuid.UUID(bob_id)


async def test_ownership_inheritance_skips_active_owner_and_solo_league(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await _join(client, bob, league["invite_code"])
    # Active owner: nothing happens.
    async with async_session() as session:
        assert await run_ownership_inheritance(session) == 0

    # Solo league with absentee owner: no candidate, nothing happens.
    await _create_league(client, bob)
    await _age_login("Bob", 45)
    await _age_login("Alice", 45)
    async with async_session() as session:
        # Alice's league transfers to Bob? No — Bob is inactive too, but the rule
        # only checks the owner; the most senior member inherits regardless.
        transferred = await run_ownership_inheritance(session)
        assert transferred == 1  # only Alice's league (Bob's has no other member)
