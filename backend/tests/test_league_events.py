"""League feed events + Pantheon (Epic 9)."""

from app.core.db import async_session
from app.services.league_events import (
    _losses_today,
    _loss_streak_before,
    _usurpation_target,
    _win_streak_before,
    evaluate_pantheon,
)


async def _signup(client, name):
    resp = await client.post("/auth/signup", json={"name": name, "password": "hunter22"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _league(client, alice, bob):
    league = (await client.post("/leagues", json={"name": "Bureau"}, headers=alice)).json()
    await client.post("/leagues/join", json={"code": league["invite_code"]}, headers=bob)
    return league


async def _post_game(client, scores, winner, date):
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


def test_streak_helpers():
    games = [
        {"id": "1", "players": ["A", "B"], "winner": "A", "date": "2026-01-01T10:00:00+00:00"},
        {"id": "2", "players": ["A", "B"], "winner": "A", "date": "2026-01-01T11:00:00+00:00"},
        {"id": "3", "players": ["A", "B"], "winner": "B", "date": "2026-01-01T12:00:00+00:00"},
        {"id": "4", "players": ["A", "B"], "winner": "B", "date": "2026-01-01T13:00:00+00:00"},
    ]
    assert _win_streak_before(games, "A", "3") == 2
    assert _loss_streak_before(games, "B", "3") == 2
    assert _win_streak_before(games, "B", "4") == 1
    from datetime import date

    assert _losses_today(games, "B", date(2026, 1, 1)) == 2
    assert _losses_today(games, "A", date(2026, 1, 1)) == 2


def test_usurpation_target_pure():
    class P:
        def __init__(self, name):
            self.name = name

    players = {"A": P("A"), "B": P("B")}
    elo = {"A": {"before": 100, "after": 130}, "B": {"before": 120, "after": 110}}
    assert _usurpation_target(elo, "A", players).name == "B"
    # No overtake, no event.
    elo = {"A": {"before": 100, "after": 110}, "B": {"before": 120, "after": 115}}
    assert _usurpation_target(elo, "A", players) is None


async def test_clean_sweep_event_in_feed(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _league(client, alice, bob)

    await _post_game(client, [40, 0], "Alice", "2026-01-05T10:00:00Z")

    feed = (await client.get(f"/leagues/{league['id']}/events", headers=bob)).json()
    sweeps = [e for e in feed if e["event_type"] == "CLEAN_SWEEP"]
    assert len(sweeps) == 1
    assert sweeps[0]["actor"]["name"] == "Alice"
    assert sweeps[0]["target"]["name"] == "Bob"
    assert "Alice" in sweeps[0]["story_text"]

    # Non-members can't read the feed.
    carol = await _signup(client, "Carol")
    assert (await client.get(f"/leagues/{league['id']}/events", headers=carol)).status_code == 403


async def test_anti_toxicity_silences_bad_day(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _league(client, alice, bob)

    # Bob takes 3 losses today, then a 4th humiliating one at 0.
    for h in (9, 10, 11):
        await _post_game(client, [40, 10], "Alice", f"2026-01-05T{h:02d}:00:00Z")
    await _post_game(client, [40, 0], "Alice", "2026-01-05T12:00:00Z")

    feed = (await client.get(f"/leagues/{league['id']}/events", headers=alice)).json()
    assert [e for e in feed if e["event_type"] == "CLEAN_SWEEP"] == []


async def test_phenix_event_on_streak_reversal(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _league(client, alice, bob)

    # Alice loses 3 straight (spread over days to dodge the toxicity filter),
    # then beats the now better-rated Bob.
    for d in (1, 2, 3):
        await _post_game(client, [10, 40], "Bob", f"2026-01-{d:02d}T10:00:00Z")
    await _post_game(client, [40, 10], "Alice", "2026-01-04T10:00:00Z")

    feed = (await client.get(f"/leagues/{league['id']}/events", headers=alice)).json()
    phenix = [e for e in feed if e["event_type"] == "PHENIX"]
    assert len(phenix) == 1
    assert phenix[0]["actor"]["name"] == "Alice"


async def test_respect_bumps_counter_and_ferveur(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _league(client, alice, bob)
    await _post_game(client, [40, 0], "Alice", "2026-01-05T10:00:00Z")

    feed = (await client.get(f"/leagues/{league['id']}/events", headers=bob)).json()
    event_id = feed[0]["id"]
    xp_before = (await client.get("/players/me", headers=alice)).json()["ferveur_xp"]

    resp = await client.post(f"/leagues/{league['id']}/events/{event_id}/respect", headers=bob)
    assert resp.status_code == 200
    assert resp.json()["respect_count"] == 1
    xp_after = (await client.get("/players/me", headers=alice)).json()["ferveur_xp"]
    assert xp_after == xp_before + 5


async def test_pantheon_records(client):
    alice = await _signup(client, "Alice")
    bob = await _signup(client, "Bob")
    league = await _league(client, alice, bob)
    await _post_game(client, [40, 0], "Alice", "2026-01-05T10:00:00Z")
    await _post_game(client, [40, 10], "Alice", "2026-01-06T10:00:00Z")

    async with async_session() as session:
        await evaluate_pantheon(session)

    pantheon = (await client.get(f"/leagues/{league['id']}/pantheon", headers=bob)).json()
    by_pillar = {p["pillar"]: p for p in pantheon}
    assert by_pillar["STAKHANOVISTE"]["value"] == 2
    assert by_pillar["TUEUR_A_GAGES"]["holder"]["name"] == "Alice"
    assert by_pillar["TUEUR_A_GAGES"]["value"] == 1
    assert by_pillar["REGNE"]["holder"]["name"] == "Alice"
    assert "_REGNE_CURRENT" not in by_pillar

    # Reign counter advances only for the same champion.
    async with async_session() as session:
        await evaluate_pantheon(session)
    pantheon = (await client.get(f"/leagues/{league['id']}/pantheon", headers=bob)).json()
    regne = next(p for p in pantheon if p["pillar"] == "REGNE")
    assert regne["value"] == 2
