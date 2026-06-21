async def _play(client, day: int, winner: str, loser: str):
    await client.post(
        "/games",
        json={
            "date": f"2026-01-{day:02d}T10:00:00Z",
            "mode": "Cricket",
            "players": [winner, loser],
            "scores": [10, 20],
            "winner": winner,
        },
    )


async def test_leaderboard_reflects_results(client):
    # Alice beats Bob twice, Bob beats Alice once.
    await _play(client, 1, "Alice", "Bob")
    await _play(client, 2, "Alice", "Bob")
    await _play(client, 3, "Bob", "Alice")

    resp = await client.get("/stats/leaderboard")
    assert resp.status_code == 200
    rows = resp.json()
    board = {row["name"]: row for row in rows}

    assert board["Alice"]["games"] == 3
    assert board["Alice"]["wins"] == 2
    assert board["Alice"]["win_rate"] == round(2 / 3, 3)
    assert board["Bob"]["games"] == 3
    assert board["Bob"]["wins"] == 1
    assert board["Alice"]["elo"] > board["Bob"]["elo"]

    # ordered by elo desc
    assert [row["name"] for row in rows][0] == "Alice"


async def test_leaderboard_empty_when_no_games(client):
    resp = await client.get("/stats/leaderboard")
    assert resp.status_code == 200
    assert resp.json() == []
