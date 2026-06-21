async def test_list_players_created_via_games(client):
    await client.post(
        "/games",
        json={
            "date": "2026-01-01T10:00:00Z",
            "mode": "Cricket",
            "players": ["Alice", "Bob"],
            "scores": [10, 20],
            "winner": "Alice",
        },
    )

    resp = await client.get("/players")
    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()}
    assert names == {"Alice", "Bob"}


async def test_get_or_create_player_does_not_duplicate(client):
    for _ in range(3):
        await client.post(
            "/games",
            json={
                "date": "2026-01-01T10:00:00Z",
                "mode": "Cricket",
                "players": ["Alice", "Bob"],
                "scores": [10, 20],
                "winner": "Alice",
            },
        )

    players = (await client.get("/players")).json()
    assert len(players) == 2
