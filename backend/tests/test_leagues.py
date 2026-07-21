async def _signup(client, name):
    resp = await client.post("/auth/signup", json={"name": name, "password": "hunter22"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _mine(client, headers):
    """/leagues/mine minus the auto-assigned Taverne (every account gets it)."""
    from app.services.leagues import TAVERNE_NAME
    rows = (await client.get("/leagues/mine", headers=headers)).json()
    return [l for l in rows if l["name"] != TAVERNE_NAME]


async def _create_league(client, headers, name="Ligue du Bureau"):
    resp = await client.post("/leagues", json={"name": name}, headers=headers)
    assert resp.status_code == 201
    return resp.json()


async def test_create_league_creator_is_owner_and_member(client):
    alice = await _signup(client, "Alice")
    league = await _create_league(client, alice)
    assert league["invite_code"]
    assert [m["name"] for m in league["members"]] == ["Alice"]

    mine = await _mine(client, alice)
    assert len(mine) == 1
    assert mine[0]["name"] == "Ligue du Bureau"


async def test_join_by_code_and_idempotent(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)

    resp = await client.post("/leagues/join", json={"code": league["invite_code"]}, headers=bob)
    assert resp.status_code == 200
    assert {m["name"] for m in resp.json()["members"]} == {"Alice", "Bob"}

    # Joining twice is a no-op, not an error.
    resp = await client.post("/leagues/join", json={"code": league["invite_code"]}, headers=bob)
    assert resp.status_code == 200
    assert len(resp.json()["members"]) == 2


async def test_join_code_is_case_insensitive(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    resp = await client.post("/leagues/join", json={"code": league["invite_code"].lower()}, headers=bob)
    assert resp.status_code == 200


async def test_join_unknown_code_404(client):
    alice = await _signup(client, "Alice")
    resp = await client.post("/leagues/join", json={"code": "NOPE99"}, headers=alice)
    assert resp.status_code == 404


async def test_rename_by_owner_only(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await client.post("/leagues/join", json={"code": league["invite_code"]}, headers=bob)

    resp = await client.patch(f"/leagues/{league['id']}", json={"name": "Renamed"}, headers=bob)
    assert resp.status_code == 403

    resp = await client.patch(f"/leagues/{league['id']}", json={"name": "Renamed"}, headers=alice)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"


async def test_delete_by_owner_cascades_membership(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await client.post("/leagues/join", json={"code": league["invite_code"]}, headers=bob)

    resp = await client.delete(f"/leagues/{league['id']}", headers=bob)
    assert resp.status_code == 403

    resp = await client.delete(f"/leagues/{league['id']}", headers=alice)
    assert resp.status_code == 204
    assert await _mine(client, bob) == []


async def test_member_can_leave_owner_cannot(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await client.post("/leagues/join", json={"code": league["invite_code"]}, headers=bob)

    bob_id = (await client.get("/players/me", headers=bob)).json()["id"]
    alice_id = (await client.get("/players/me", headers=alice)).json()["id"]

    # Bob can't kick Alice, only the owner can remove others.
    resp = await client.delete(f"/leagues/{league['id']}/members/{alice_id}", headers=bob)
    assert resp.status_code == 403

    # Bob leaves.
    resp = await client.delete(f"/leagues/{league['id']}/members/{bob_id}", headers=bob)
    assert resp.status_code == 204
    assert await _mine(client, bob) == []

    # Owner can't leave their own league.
    resp = await client.delete(f"/leagues/{league['id']}/members/{alice_id}", headers=alice)
    assert resp.status_code == 400


async def test_owner_adds_anonymous_player_by_name(client):
    alice = await _signup(client, "Alice")
    # Recording a game auto-creates "Bob" without an account.
    await client.post(
        "/games",
        json={
            "date": "2026-01-01T10:00:00Z",
            "mode": "Cricket",
            "players": ["Alice", "Bob"],
            "scores": [10, 20],
            "winner": "Bob",
        },
    )
    league = await _create_league(client, alice)

    resp = await client.post(f"/leagues/{league['id']}/members", json={"name": "Bob"}, headers=alice)
    assert resp.status_code == 200
    assert {m["name"] for m in resp.json()["members"]} == {"Alice", "Bob"}

    resp = await client.post(f"/leagues/{league['id']}/members", json={"name": "Ghost"}, headers=alice)
    assert resp.status_code == 404


async def test_owner_can_kick_member(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await client.post("/leagues/join", json={"code": league["invite_code"]}, headers=bob)
    bob_id = (await client.get("/players/me", headers=bob)).json()["id"]

    resp = await client.delete(f"/leagues/{league['id']}/members/{bob_id}", headers=alice)
    assert resp.status_code == 204
    assert await _mine(client, bob) == []


async def test_all_endpoints_require_auth(client):
    assert (await client.post("/leagues", json={"name": "X"})).status_code == 401
    assert (await client.get("/leagues/mine")).status_code == 401
    assert (await client.post("/leagues/join", json={"code": "ABC234"})).status_code == 401


# ─── Webhook de ligue ────────────────────────────────────────────────────────

async def test_league_webhook_permissions_and_clear(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await client.post("/leagues/join", json={"code": league["invite_code"]}, headers=bob)

    url = f"/leagues/{league['id']}/webhook"

    # Simple membre : refusé.
    resp = await client.patch(url, json={"webhook_url": "https://chat.example/x"}, headers=bob)
    assert resp.status_code == 403

    # Owner : accepté et visible dans LeagueRead.
    resp = await client.patch(url, json={"webhook_url": "https://chat.example/x"}, headers=alice)
    assert resp.status_code == 200
    assert resp.json()["webhook_url"] == "https://chat.example/x"

    # Membre promu admin : accepté.
    bob_id = next(m["id"] for m in resp.json()["members"] if m["name"] == "Bob")
    await client.patch(f"/leagues/{league['id']}/members/{bob_id}/role", json={"role": "admin"}, headers=alice)
    resp = await client.patch(url, json={"webhook_url": "https://chat.example/y"}, headers=bob)
    assert resp.status_code == 200

    # http:// refusé.
    resp = await client.patch(url, json={"webhook_url": "http://insecure.example/x"}, headers=alice)
    assert resp.status_code == 422

    # null efface.
    resp = await client.patch(url, json={"webhook_url": None}, headers=alice)
    assert resp.status_code == 200
    assert resp.json()["webhook_url"] is None


async def test_league_webhook_test_endpoint(client, fake_httpx):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _create_league(client, alice)
    await client.post("/leagues/join", json={"code": league["invite_code"]}, headers=bob)

    test_url = f"/leagues/{league['id']}/webhook/test"

    # Pas encore configuré → 404.
    resp = await client.post(test_url, headers=alice)
    assert resp.status_code == 404

    await client.patch(
        f"/leagues/{league['id']}/webhook",
        json={"webhook_url": "https://chat.example/x"},
        headers=alice,
    )

    # Simple membre → 403.
    resp = await client.post(test_url, headers=bob)
    assert resp.status_code == 403

    # Admin → 202 et la carte de test part sur l'URL de la ligue.
    resp = await client.post(test_url, headers=alice)
    assert resp.status_code == 202
    assert [u for u, _ in fake_httpx.calls] == ["https://chat.example/x"]
