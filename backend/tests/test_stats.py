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


async def test_leaderboard_mode_filter_aggregates_shanghai_family(client):
    # Filtering by "Shanghai" should count Bull/Random/Crazy games too, since
    # they share one Elo scope with classic Shanghai.
    await _play(client, 1, "Alice", "Bob", mode="Shanghai")
    await _play(client, 2, "Alice", "Bob", mode="ShanghaiBull")
    await _play(client, 3, "Alice", "Bob", mode="ShanghaiRandom")
    await _play(client, 4, "Alice", "Bob", mode="ShanghaiCrazy")
    await _play(client, 5, "Alice", "Bob", mode="Cricket")  # unrelated family, must not be counted

    shanghai = {row["name"]: row for row in (await client.get("/stats/leaderboard", params={"mode": "Shanghai"})).json()}
    assert shanghai["Alice"]["games"] == 4
    assert shanghai["Alice"]["wins"] == 4
    assert shanghai["Bob"]["games"] == 4


# ─── Paramètre season (C4) ────────────────────────────────────────────────────

async def test_leaderboard_season_all_counts_everything(client):
    """season=all retire la borne de saison : tout l'historique compte, même
    hors de la fenêtre de la saison active."""
    from datetime import date

    from app.core.db import async_session
    from app.models import Season

    # Saison active récente : par défaut, elle bornerait le comptage.
    async with async_session() as session:
        session.add(Season(name="Active", start_date=date(2026, 8, 1), end_date=None, is_active=True))
        await session.commit()

    await _play(client, 1, "Alice", "Bob")   # janvier — hors saison active
    await _play(client, 2, "Alice", "Bob")

    # Par défaut (saison active) : les parties de janvier ne comptent pas.
    default = {r["name"]: r for r in (await client.get("/stats/leaderboard")).json()}
    assert default.get("Alice", {}).get("games", 0) == 0

    # season=all : elles comptent.
    all_rows = {r["name"]: r for r in (await client.get("/stats/leaderboard?season=all")).json()}
    assert all_rows["Alice"]["games"] == 2


async def test_leaderboard_past_season_window(client):
    """season=<id d'une saison close> scope les comptages à sa fenêtre."""
    from datetime import date

    from app.core.db import async_session
    from app.models import Season

    async with async_session() as session:
        past = Season(name="Janvier", start_date=date(2026, 1, 1), end_date=date(2026, 1, 31))
        session.add(past)
        await session.commit()
        past_id = str(past.id)

    await _play(client, 5, "Alice", "Bob")    # dans la fenêtre de janvier
    await _play(client, 10, "Alice", "Bob")   # dans la fenêtre

    rows = {r["name"]: r for r in (await client.get(f"/stats/leaderboard?season={past_id}")).json()}
    assert rows["Alice"]["games"] == 2
    assert rows["Alice"]["wins"] == 2


async def test_leaderboard_season_invalid_and_unknown(client):
    import uuid

    bad = await client.get("/stats/leaderboard?season=pas-un-uuid")
    assert bad.status_code == 422

    unknown = await client.get(f"/stats/leaderboard?season={uuid.uuid4()}")
    assert unknown.status_code == 404
