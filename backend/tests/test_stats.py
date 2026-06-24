async def _play(client, day: int, winner: str, loser: str, mode: str = "Cricket"):
    await client.post(
        "/games",
        json={
            "date": f"2026-01-{day:02d}T10:00:00Z",
            "mode": mode,
            "players": [winner, loser],
            "scores": [20, 10],  # winner listed first must also score higher — Elo now ranks by score
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


async def test_leaderboard_includes_rank(client):
    await _play(client, 1, "Alice", "Bob")
    rows = (await client.get("/stats/leaderboard")).json()
    board = {row["name"]: row for row in rows}
    assert board["Alice"]["rank"]  # non-empty tier name
    assert board["Bob"]["rank"]


async def test_leaderboard_mode_filter_scopes_games_wins_and_elo(client):
    # Alice dominates Cricket, Bob dominates Shanghai.
    await _play(client, 1, "Alice", "Bob", mode="Cricket")
    await _play(client, 2, "Alice", "Bob", mode="Cricket")
    await _play(client, 3, "Bob", "Alice", mode="Shanghai")
    await _play(client, 4, "Bob", "Alice", mode="Shanghai")

    cricket = {row["name"]: row for row in (await client.get("/stats/leaderboard", params={"mode": "Cricket"})).json()}
    assert cricket["Alice"]["games"] == 2
    assert cricket["Alice"]["wins"] == 2
    assert cricket["Alice"]["elo"] > cricket["Bob"]["elo"]

    shanghai = {row["name"]: row for row in (await client.get("/stats/leaderboard", params={"mode": "Shanghai"})).json()}
    assert shanghai["Bob"]["games"] == 2
    assert shanghai["Bob"]["wins"] == 2
    assert shanghai["Bob"]["elo"] > shanghai["Alice"]["elo"]

    # Global view aggregates across both modes — neither dominates overall.
    overall = {row["name"]: row for row in (await client.get("/stats/leaderboard")).json()}
    assert overall["Alice"]["games"] == 4
    assert overall["Bob"]["games"] == 4
