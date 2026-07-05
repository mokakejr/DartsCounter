"""Taverne auto-assignment (Epic 1.1): no account ever lands without a league."""

from app.services.leagues import TAVERNE_LEAGUE_ID, TAVERNE_NAME


async def _signup(client, name):
    resp = await client.post("/auth/signup", json={"name": name, "password": "hunter22"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_signup_auto_assigns_taverne(client):
    alice = await _signup(client, "Alice")
    mine = (await client.get("/leagues/mine", headers=alice)).json()
    assert [l["name"] for l in mine] == [TAVERNE_NAME]
    assert mine[0]["id"] == str(TAVERNE_LEAGUE_ID)
    assert mine[0]["owner_id"] is None
    assert mine[0]["privacy_level"] == "PUBLIC"


async def test_taverne_is_shared_and_unmanageable(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    mine = (await client.get("/leagues/mine", headers=bob)).json()
    assert {m["name"] for m in mine[0]["members"]} == {"Alice", "Bob"}

    # Nobody owns the Taverne — no rename, no delete, no role changes.
    tid = str(TAVERNE_LEAGUE_ID)
    assert (await client.patch(f"/leagues/{tid}", json={"name": "X"}, headers=alice)).status_code == 403
    assert (await client.delete(f"/leagues/{tid}", headers=alice)).status_code == 403


async def test_player_with_a_league_is_not_reassigned(client):
    alice = await _signup(client, "Alice")
    await client.post("/leagues", json={"name": "Ma Ligue"}, headers=alice)
    tid = str(TAVERNE_LEAGUE_ID)
    me = (await client.get("/players/me", headers=alice)).json()
    # Leave the Taverne, keep the personal league.
    resp = await client.delete(f"/leagues/{tid}/members/{me['id']}", headers=alice)
    assert resp.status_code == 204

    # Logging back in must NOT drag the player back into the Taverne.
    resp = await client.post("/auth/login", json={"name": "Alice", "password": "hunter22"})
    assert resp.status_code == 200
    mine = (await client.get("/leagues/mine", headers=alice)).json()
    assert [l["name"] for l in mine] == ["Ma Ligue"]


async def test_login_reassigns_player_without_any_league(client):
    alice = await _signup(client, "Alice")
    me = (await client.get("/players/me", headers=alice)).json()
    tid = str(TAVERNE_LEAGUE_ID)
    await client.delete(f"/leagues/{tid}/members/{me['id']}", headers=alice)
    assert (await client.get("/leagues/mine", headers=alice)).json() == []

    resp = await client.post("/auth/login", json={"name": "Alice", "password": "hunter22"})
    assert resp.status_code == 200
    mine = (await client.get("/leagues/mine", headers=alice)).json()
    assert [l["name"] for l in mine] == [TAVERNE_NAME]


async def test_me_exposes_games_played(client):
    alice = await _signup(client, "Alice")
    assert (await client.get("/players/me", headers=alice)).json()["games_played"] == 0
    for i in range(3):
        await client.post(
            "/games",
            json={
                "date": f"2026-01-0{i + 1}T10:00:00Z",
                "mode": "Cricket",
                "players": ["Alice", "Bob"],
                "scores": [10, 20],
                "winner": "Bob",
            },
        )
    assert (await client.get("/players/me", headers=alice)).json()["games_played"] == 3
