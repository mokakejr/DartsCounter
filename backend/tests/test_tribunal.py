"""Reports + tribunal adjudication (Epic 6.3)."""


async def _signup(client, name):
    resp = await client.post("/auth/signup", json={"name": name, "password": "hunter22"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _post_game(client, winner="Alice"):
    resp = await client.post(
        "/games",
        json={
            "date": "2026-01-05T10:00:00Z",
            "mode": "Cricket",
            "players": ["Alice", "Bob"],
            "scores": [40, 30] if winner == "Alice" else [30, 40],
            "winner": winner,
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def _league_with(client, owner_headers, member_names):
    league = (await client.post("/leagues", json={"name": "Bureau"}, headers=owner_headers)).json()
    for name in member_names:
        await client.post(f"/leagues/{league['id']}/members", json={"name": name}, headers=owner_headers)
    return league


async def test_report_freezes_game_and_removes_elo(client):
    bob = await _signup(client, "Bob")
    game = await _post_game(client)
    board = (await client.get("/stats/leaderboard")).json()
    assert next(r for r in board if r["name"] == "Alice")["games"] == 1

    resp = await client.post(
        f"/games/{game['id']}/report", json={"reason": "impossible_score"}, headers=bob
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "PENDING_REVIEW"
    assert resp.json()["flag_reason"] == "impossible_score"

    board = (await client.get("/stats/leaderboard")).json()
    assert next(r for r in board if r["name"] == "Alice")["games"] == 0


async def test_adjudicate_validate_restores_elo(client):
    carol = await _signup(client, "Carol")  # league owner containing Alice
    bob = await _signup(client, "Bob")
    game = await _post_game(client)
    await _league_with(client, carol, ["Alice"])

    await client.post(f"/games/{game['id']}/report", json={"reason": "impossible_score"}, headers=bob)

    resp = await client.post(
        f"/games/{game['id']}/adjudicate", json={"action": "validate"}, headers=carol
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "COMPLETED"
    board = (await client.get("/stats/leaderboard")).json()
    assert next(r for r in board if r["name"] == "Alice")["games"] == 1


async def test_adjudicate_void_keeps_game_out(client):
    carol = await _signup(client, "Carol")
    bob = await _signup(client, "Bob")
    game = await _post_game(client)
    await _league_with(client, carol, ["Alice"])
    await client.post(f"/games/{game['id']}/report", json={"reason": "rage_quit"}, headers=bob)

    resp = await client.post(f"/games/{game['id']}/adjudicate", json={"action": "void"}, headers=carol)
    assert resp.status_code == 200
    assert resp.json()["status"] == "VOIDED"
    board = (await client.get("/stats/leaderboard")).json()
    assert next(r for r in board if r["name"] == "Alice")["games"] == 0

    # A voided game can't be re-adjudicated or re-reported.
    assert (
        await client.post(f"/games/{game['id']}/adjudicate", json={"action": "validate"}, headers=carol)
    ).status_code == 409
    assert (
        await client.post(f"/games/{game['id']}/report", json={"reason": "other"}, headers=bob)
    ).status_code == 409


async def test_random_member_cannot_adjudicate(client):
    bob = await _signup(client, "Bob")
    dave = await _signup(client, "Dave")  # no league with the participants
    game = await _post_game(client)
    await client.post(f"/games/{game['id']}/report", json={"reason": "other"}, headers=bob)

    resp = await client.post(f"/games/{game['id']}/adjudicate", json={"action": "void"}, headers=dave)
    assert resp.status_code == 403


async def test_disputes_listed_for_league_admin(client):
    carol = await _signup(client, "Carol")
    bob = await _signup(client, "Bob")
    game = await _post_game(client)
    league = await _league_with(client, carol, ["Alice"])
    await client.post(f"/games/{game['id']}/report", json={"reason": "impossible_score"}, headers=bob)

    disputes = (await client.get(f"/leagues/{league['id']}/disputes", headers=carol)).json()
    assert [d["id"] for d in disputes] == [game["id"]]
    assert disputes[0]["flag_reason"] == "impossible_score"

    # Plain members don't see the tribunal tab.
    assert (await client.get(f"/leagues/{league['id']}/disputes", headers=bob)).status_code == 403
