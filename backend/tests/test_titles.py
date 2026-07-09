"""Contextual title engine (Epic 8.1)."""


async def _signup(client, name):
    resp = await client.post("/auth/signup", json={"name": name, "password": "hunter22"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _post_game(client, scores, winner="Alice", date="2026-01-05T10:00:00Z"):
    resp = await client.post(
        "/games",
        json={
            "date": date,
            "mode": "Cricket",
            "players": ["Alice", "Bob"],
            "scores": scores,
            "winner": winner,
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def test_social_owner_unlocked_and_autoequipped(client):
    alice = await _signup(client, "Alice")
    await client.post("/leagues", json={"name": "Ma Ligue"}, headers=alice)
    # Titles are evaluated at game end, not at league creation.
    await _post_game(client, [40, 30])

    titles = (await client.get("/players/me/titles", headers=alice)).json()
    ids = {t["id"]: t for t in titles}
    assert "social_owner" in ids
    assert ids["social_owner"]["is_equipped"] is True
    assert ids["social_owner"]["label"] == "Tyran de la Ligue"

    me = (await client.get("/players/me", headers=alice)).json()
    assert me["title"] == "Tyran de la Ligue"


async def test_fail_26_after_three_games_at_26(client):
    alice = await _signup(client, "Alice")
    for i in range(3):
        await _post_game(client, [26, 40], winner="Bob", date=f"2026-01-{i + 1:02d}T10:00:00Z")

    titles = (await client.get("/players/me/titles", headers=alice)).json()
    assert "fail_26" in {t["id"] for t in titles}


async def test_equip_switches_single_active_title(client):
    alice = await _signup(client, "Alice")
    await client.post("/leagues", json={"name": "Ma Ligue"}, headers=alice)
    for i in range(3):
        await _post_game(client, [26, 40], winner="Bob", date=f"2026-01-{i + 1:02d}T10:00:00Z")

    resp = await client.post("/players/me/titles/fail_26/equip", headers=alice)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Abonné au 26"

    titles = (await client.get("/players/me/titles", headers=alice)).json()
    equipped = [t["id"] for t in titles if t["is_equipped"]]
    assert equipped == ["fail_26"]

    # Can't equip a locked title.
    assert (await client.post("/players/me/titles/rank_diamond/equip", headers=alice)).status_code == 404


async def test_title_visible_on_leaderboard(client):
    alice = await _signup(client, "Alice")
    await client.post("/leagues", json={"name": "Ma Ligue"}, headers=alice)
    await _post_game(client, [40, 30])

    board = (await client.get("/stats/leaderboard")).json()
    row = next(r for r in board if r["name"] == "Alice")
    assert row["title"] == "Tyran de la Ligue"
