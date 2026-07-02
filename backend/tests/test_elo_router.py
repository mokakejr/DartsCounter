from sqlalchemy import select

from app.core.db import async_session
from app.models import Player


async def _signup(client, name="Alice", password="hunter22"):
    resp = await client.post("/auth/signup", json={"name": name, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _make_admin(name: str) -> None:
    async with async_session() as session:
        player = (await session.execute(select(Player).where(Player.name == name))).scalar_one()
        player.is_admin = True
        await session.commit()


async def test_get_settings_is_public_and_returns_defaults(client):
    resp = await client.get("/elo/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["starting_rating"] == 10000
    assert body["convergence"] == 4000
    assert body["k_factors"] == [800, 400, 300, 200]
    assert body["k_thresholds"] == [5, 10, 15]
    assert body["bronze_ceiling"] == 9000
    assert body["rank_tier_value"] == 1200
    assert body["champion_multiplier"] == 2.5
    assert body["min_ranked_games"] == 5


async def test_patch_settings_requires_auth(client):
    resp = await client.patch("/elo/settings", json={"starting_rating": 5000})
    assert resp.status_code == 401


async def test_patch_settings_rejects_non_admin(client):
    token = await _signup(client)
    resp = await client.patch("/elo/settings", json={"starting_rating": 5000}, headers=_auth(token))
    assert resp.status_code == 403


async def test_patch_settings_admin_can_update(client):
    token = await _signup(client)
    await _make_admin("Alice")
    resp = await client.patch("/elo/settings", json={"starting_rating": 5000}, headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["starting_rating"] == 5000


async def test_patch_settings_rejects_inconsistent_k_schedule(client):
    token = await _signup(client)
    await _make_admin("Alice")
    resp = await client.patch(
        "/elo/settings",
        json={"k_factors": [800, 400, 200], "k_thresholds": [5]},
        headers=_auth(token),
    )
    assert resp.status_code == 422


async def test_patch_settings_rejects_partial_update_that_breaks_existing_schedule(client):
    # k_factors has 4 entries / k_thresholds has 3 by default — patching only
    # k_thresholds down to 1 entry would leave a mismatched stored pair.
    token = await _signup(client)
    await _make_admin("Alice")
    resp = await client.patch("/elo/settings", json={"k_thresholds": [5]}, headers=_auth(token))
    assert resp.status_code == 422


async def test_score_direction_create_requires_admin(client):
    token = await _signup(client)
    resp = await client.post(
        "/elo/score-directions", json={"mode": "Cricket", "variant": "Cut Throat"}, headers=_auth(token)
    )
    assert resp.status_code == 403


async def test_score_direction_crud_as_admin(client):
    token = await _signup(client)
    await _make_admin("Alice")

    created = await client.post(
        "/elo/score-directions",
        json={"mode": "FiftyOne", "variant": None, "lower_is_better": True},
        headers=_auth(token),
    )
    assert created.status_code == 201
    direction_id = created.json()["id"]

    listed = await client.get("/elo/score-directions")
    assert any(d["id"] == direction_id for d in listed.json())

    updated = await client.patch(
        f"/elo/score-directions/{direction_id}", json={"lower_is_better": False}, headers=_auth(token)
    )
    assert updated.status_code == 200
    assert updated.json()["lower_is_better"] is False

    deleted = await client.delete(f"/elo/score-directions/{direction_id}", headers=_auth(token))
    assert deleted.status_code == 204

    listed_after = await client.get("/elo/score-directions")
    assert all(d["id"] != direction_id for d in listed_after.json())


async def test_recompute_requires_admin(client):
    token = await _signup(client)
    resp = await client.post("/elo/recompute", headers=_auth(token))
    assert resp.status_code == 403


async def test_recompute_rebuilds_ratings(client):
    token = await _signup(client)
    await _make_admin("Alice")
    await _signup(client, "Bob", "hunter22")

    await client.post(
        "/games",
        json={
            "date": "2026-01-01T10:00:00Z",
            "mode": "Cricket",
            "players": ["Alice", "Bob"],
            "scores": [20, 10],
            "winner": "Alice",
        },
    )

    resp = await client.post("/elo/recompute", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["players_updated"] == 2

    ratings = (await client.get("/players/Alice/ratings")).json()
    global_rating = next(r for r in ratings if r["scope"] == "global")
    assert global_rating["rating"] > 10000
    assert global_rating["games_played"] == 1


async def test_player_ratings_includes_global_and_mode_scope_with_rank(client):
    await _signup(client, "Alice", "hunter22")
    await _signup(client, "Bob", "hunter22")
    await client.post(
        "/games",
        json={
            "date": "2026-01-01T10:00:00Z",
            "mode": "Cricket",
            "players": ["Alice", "Bob"],
            "scores": [20, 10],
            "winner": "Alice",
        },
    )

    resp = await client.get("/players/Alice/ratings")
    assert resp.status_code == 200
    scopes = {r["scope"] for r in resp.json()}
    assert scopes == {"global", "Cricket"}
    for row in resp.json():
        assert row["rank"]  # non-empty tier name


async def test_player_ratings_404_for_unknown_player(client):
    resp = await client.get("/players/Nobody/ratings")
    assert resp.status_code == 404


async def test_player_elo_history_filters_by_scope(client):
    await _signup(client, "Alice", "hunter22")
    await _signup(client, "Bob", "hunter22")
    await client.post(
        "/games",
        json={
            "date": "2026-01-01T10:00:00Z",
            "mode": "Cricket",
            "players": ["Alice", "Bob"],
            "scores": [20, 10],
            "winner": "Alice",
        },
    )

    all_history = (await client.get("/players/Alice/elo-history")).json()
    assert {h["scope"] for h in all_history} == {"global", "Cricket"}

    global_only = (await client.get("/players/Alice/elo-history", params={"scope": "global"})).json()
    assert len(global_only) == 1
    assert global_only[0]["scope"] == "global"
    assert global_only[0]["game_mode"] == "Cricket"


async def test_player_elo_extremes_404_for_unknown_player(client):
    resp = await client.get("/players/Nobody/elo-extremes")
    assert resp.status_code == 404


async def test_player_elo_extremes_none_for_player_with_no_games(client):
    await _signup(client, "Alice", "hunter22")
    resp = await client.get("/players/Alice/elo-extremes")
    assert resp.status_code == 200
    body = resp.json()
    assert body["scope"] == "global"
    assert body["best_elo"] is None
    assert body["best_rank"] is None


async def test_player_elo_extremes_derives_rank_and_elo_history(client):
    await _signup(client, "Alice", "hunter22")
    await _signup(client, "Bob", "hunter22")
    await client.post(
        "/games",
        json={
            "date": "2026-01-01T10:00:00Z",
            "mode": "Cricket",
            "players": ["Alice", "Bob"],
            "scores": [30, 10],
            "winner": "Alice",
        },
    )
    await _signup(client, "Charlie", "hunter22")
    await client.post(
        "/games",
        json={
            "date": "2026-01-02T10:00:00Z",
            "mode": "Cricket",
            "players": ["Alice", "Charlie"],
            "scores": [30, 10],
            "winner": "Alice",
        },
    )

    # Ground truth pulled from already-covered endpoints, not hand-derived Elo math.
    alice_history = (await client.get("/players/Alice/elo-history", params={"scope": "global"})).json()
    after_game2, after_game1 = alice_history[0], alice_history[1]  # newest first
    bob_elo = next(
        r["rating"] for r in (await client.get("/players/Bob/ratings")).json() if r["scope"] == "global"
    )
    charlie_elo = next(
        r["rating"] for r in (await client.get("/players/Charlie/ratings")).json() if r["scope"] == "global"
    )

    rank_at_game1 = 1 if after_game1["elo_after"] > bob_elo else 2
    rank_at_game2 = 1 + sum(
        1 for v in (bob_elo, charlie_elo) if v > after_game2["elo_after"]
    )
    snapshots = [
        (after_game1["elo_after"], after_game1["game_date"], rank_at_game1, 2),
        (after_game2["elo_after"], after_game2["game_date"], rank_at_game2, 3),
    ]
    best_elo_snap = max(snapshots, key=lambda s: s[0])
    worst_elo_snap = min(snapshots, key=lambda s: s[0])
    best_rank_snap = min(snapshots, key=lambda s: s[2])
    worst_rank_snap = max(snapshots, key=lambda s: s[2])

    resp = await client.get("/players/Alice/elo-extremes")
    assert resp.status_code == 200
    body = resp.json()
    assert body["best_elo"] == best_elo_snap[0]
    assert body["best_elo_date"] == best_elo_snap[1]
    assert body["worst_elo"] == worst_elo_snap[0]
    assert body["worst_elo_date"] == worst_elo_snap[1]
    assert body["best_rank"] == best_rank_snap[2]
    assert body["best_rank_total_players"] == best_rank_snap[3]
    assert body["worst_rank"] == worst_rank_snap[2]
    assert body["worst_rank_total_players"] == worst_rank_snap[3]
