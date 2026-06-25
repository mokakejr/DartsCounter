BASE_GAME = {
    "date": "2026-01-01T10:00:00Z",
    "mode": "Cricket",
    "variant": "Normal",
    "duration": 120,
    "players": ["Alice", "Bob"],
    "scores": [20, 10],
    "winner": "Alice",
}


async def test_create_and_get_game(client):
    resp = await client.post("/games", json=BASE_GAME)
    assert resp.status_code == 201
    body = resp.json()
    assert body["winner"] == "Alice"
    assert {p["name"] for p in body["players"]} == {"Alice", "Bob"}
    assert next(p["position"] for p in body["players"] if p["name"] == "Alice") == 1
    assert next(p["position"] for p in body["players"] if p["name"] == "Bob") == 2

    games = (await client.get("/games")).json()
    assert len(games) == 1
    assert games[0]["id"] == body["id"]


async def test_create_game_idempotent_retry(client):
    payload = {**BASE_GAME, "id": "11111111-1111-1111-1111-111111111111"}

    first = await client.post("/games", json=payload)
    second = await client.post("/games", json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json() == second.json()
    assert len((await client.get("/games")).json()) == 1


async def test_create_game_invalid_winner_rejected(client):
    payload = {**BASE_GAME, "winner": "Nobody"}
    resp = await client.post("/games", json=payload)
    assert resp.status_code == 422
    assert len((await client.get("/games")).json()) == 0


async def test_create_game_mismatched_scores_rejected(client):
    payload = {**BASE_GAME, "scores": [10]}
    resp = await client.post("/games", json=payload)
    assert resp.status_code == 422


async def test_create_game_tie_has_no_winner(client):
    # Shanghai allows ties — winner is None/absent, not an error. A real tie
    # (equal scores) moves no Elo when both players start at the same
    # rating: expected == actual (0.5 each), delta is exactly zero.
    payload = {**BASE_GAME, "scores": [10, 10], "winner": None}
    resp = await client.post("/games", json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["winner"] is None
    assert all(p["position"] == 2 for p in body["players"])

    leaderboard = (await client.get("/stats/leaderboard")).json()
    assert all(row["elo"] == 10000 for row in leaderboard)  # no elo movement on a tie


async def test_list_games_ordered_newest_first(client):
    for day in (1, 2, 3):
        await client.post("/games", json={**BASE_GAME, "date": f"2026-01-0{day}T10:00:00Z"})

    games = (await client.get("/games", params={"limit": 2})).json()
    assert len(games) == 2
    assert games[0]["date"] > games[1]["date"]
