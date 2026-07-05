"""Tournois score-attack + saisons (Hub v2)."""

from datetime import date, datetime, timedelta, timezone

from app.core.db import async_session
from app.services.seasons import get_active_season, rollover_if_needed


async def _signup(client, name):
    resp = await client.post("/auth/signup", json={"name": name, "password": "hunter22"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _tournament(client, headers, league_id, hours_ago_start=1, hours_end=48):
    now = datetime.now(timezone.utc)
    resp = await client.post(
        "/tournaments",
        json={
            "league_id": league_id,
            "title": "Coupe de la Taverne — Sprint 51",
            "starts_at": (now - timedelta(hours=hours_ago_start)).isoformat(),
            "ends_at": (now + timedelta(hours=hours_end)).isoformat(),
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_tournament_lifecycle_tickets_and_best(client):
    alice = await _signup(client, "Alice")
    league = (await client.post("/leagues", json={"name": "Bureau"}, headers=alice)).json()
    t = await _tournament(client, alice, league["id"])
    assert t["phase"] == "live"

    # Inscription + 3 tickets max, consommés au lancement de l'essai.
    await client.post(f"/tournaments/{t['id']}/enter", json={"name": "Alice"})
    for left in (2, 1, 0):
        resp = await client.post(f"/tournaments/{t['id']}/attempts", json={"name": "Alice"})
        assert resp.status_code == 200
        assert resp.json()["tickets_left"] == left
    assert (await client.post(f"/tournaments/{t['id']}/attempts", json={"name": "Alice"})).status_code == 409

    # Seul le meilleur essai compte (fewest_darts : plus petit = meilleur).
    await client.post(f"/tournaments/{t['id']}/attempts/submit", json={"name": "Alice", "value": 21})
    state = (await client.post(f"/tournaments/{t['id']}/attempts/submit", json={"name": "Alice", "value": 18})).json()
    entry = state["entries"][0]
    assert entry["best_value"] == 18
    # Un moins bon essai ne remplace pas.
    state = (await client.post(f"/tournaments/{t['id']}/attempts/submit", json={"name": "Alice", "value": 25})).json()
    assert state["entries"][0]["best_value"] == 18


async def test_tournament_tie_first_submitter_wins(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = (await client.post("/leagues", json={"name": "Bureau"}, headers=alice)).json()
    await client.post(
        f"/leagues/{league['id']}/members", json={"name": "Bob"}, headers=alice
    )
    t = await _tournament(client, alice, league["id"])

    for name in ("Alice", "Bob"):
        await client.post(f"/tournaments/{t['id']}/attempts", json={"name": name})
    await client.post(f"/tournaments/{t['id']}/attempts/submit", json={"name": "Bob", "value": 20})
    state = (await client.post(f"/tournaments/{t['id']}/attempts/submit", json={"name": "Alice", "value": 20})).json()
    ranks = {e["name"]: e["rank"] for e in state["entries"]}
    assert ranks["Bob"] == 1  # premier soumis à égalité stricte
    assert ranks["Alice"] == 2


async def test_tournament_creation_requires_league_admin(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = (await client.post("/leagues", json={"name": "Bureau"}, headers=alice)).json()
    await client.post("/leagues/join", json={"code": league["invite_code"]}, headers=bob)
    now = datetime.now(timezone.utc)
    resp = await client.post(
        "/tournaments",
        json={
            "league_id": league["id"],
            "title": "X",
            "starts_at": now.isoformat(),
            "ends_at": (now + timedelta(days=1)).isoformat(),
        },
        headers=bob,
    )
    assert resp.status_code == 403


async def test_season_rollover_soft_reset(client):
    alice = await _signup(client, "Alice")
    # Deux parties classées pour créer des ratings.
    for d in (1, 2):
        await client.post(
            "/games",
            json={
                "date": f"2026-07-0{d}T10:00:00Z",
                "mode": "Cricket",
                "players": ["Alice", "Bob"],
                "scores": [40, 10],
                "winner": "Alice",
            },
        )

    async with async_session() as session:
        # Première saison créée à la volée.
        season = await rollover_if_needed(session)
        assert season is not None and season.is_active

        board = (await client.get("/stats/leaderboard")).json()
        alice_elo = next(r for r in board if r["name"] == "Alice")["elo"]

        # Forcer la fin de saison -> clôture + soft reset + nouvelle saison.
        season.end_date = date.today() - timedelta(days=1)
        await session.commit()
        new_season = await rollover_if_needed(session)
        assert new_season is not None and new_season.id != season.id
        active = await get_active_season(session)
        assert active.id == new_season.id

    board = (await client.get("/stats/leaderboard")).json()
    alice_after = next(r for r in board if r["name"] == "Alice")["elo"]
    # Compressé vers le point de départ (10000) : plus proche, pas égal.
    settings = (await client.get("/elo/settings")).json()
    start = settings["starting_rating"]
    assert abs(alice_after - start) < abs(alice_elo - start)
    assert alice_after != start

    # Champion couronné.
    titles = (await client.get("/players/me/titles", headers=alice)).json()
    assert "season_champion" in {t["id"] for t in titles}
