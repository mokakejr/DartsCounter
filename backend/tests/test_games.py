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


async def test_casual_game_recorded_but_excluded_from_elo(client):
    payload = {**BASE_GAME, "is_casual": True}
    resp = await client.post("/games", json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["is_casual"] is True

    # Still logged as a played game...
    games = (await client.get("/games")).json()
    assert len(games) == 1
    assert games[0]["is_casual"] is True

    # ...but never touched Elo — no rating row was ever created for it.
    assert (await client.get("/players/Alice/ratings")).json() == []


async def test_competitive_game_defaults_is_casual_false(client):
    resp = await client.post("/games", json=BASE_GAME)
    assert resp.json()["is_casual"] is False


async def test_casual_game_excluded_from_leaderboard_games_count(client):
    await client.post("/games", json={**BASE_GAME, "is_casual": True})
    await client.post("/games", json={**BASE_GAME, "date": "2026-01-02T10:00:00Z"})

    leaderboard = (await client.get("/stats/leaderboard")).json()
    alice = next(r for r in leaderboard if r["name"] == "Alice")
    assert alice["games"] == 1
    assert alice["wins"] == 1


async def test_solo_training_records_no_victory(client):
    # Entraînement solo (Bob27, 1 joueur) : aucune victoire comptée — le joueur
    # solo « gagne » trivialement mais rien ne doit l'enregistrer.
    resp = await client.post("/auth/signup", json={"name": "Solo", "password": "hunter22"})
    solo = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    body = (await client.post("/games", json={
        "date": "2026-07-03T10:00:00Z",
        "mode": "Bob27",
        "players": ["Solo"],
        "scores": [27],
        "winner": "Solo",
        "is_casual": True,
    })).json()
    # Pas de vainqueur enregistré, ni dans la réponse ni en base.
    assert body["winner"] is None
    stored = (await client.get("/games")).json()[0]
    assert stored["winner"] is None

    # Pas de bonus XP de victoire (+30) : base 50 × 1.1 (série 1) = 55,
    # et non (50 + 30) × 1.1 = 88.
    me = (await client.get("/players/me", headers=solo)).json()
    assert me["ferveur_xp"] == 55


async def test_list_games_ordered_newest_first(client):
    for day in (1, 2, 3):
        await client.post("/games", json={**BASE_GAME, "date": f"2026-01-0{day}T10:00:00Z"})

    games = (await client.get("/games", params={"limit": 2})).json()
    assert len(games) == 2
    assert games[0]["date"] > games[1]["date"]
