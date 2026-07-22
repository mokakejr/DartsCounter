"""Trust factor + statistical outlier freeze (Epics 6.1 / 6.2)."""

from app.services.anticheat import bump_trust, is_outlier


class _P:
    trust_factor = 50


def test_trust_is_clamped():
    p = _P()
    bump_trust(p, +200)
    assert p.trust_factor == 100
    bump_trust(p, -500)
    assert p.trust_factor == 0


def test_outlier_needs_enough_history():
    assert is_outlier(300, [40.0] * 5) is False  # sample too small


def test_outlier_flags_only_aberrant_improvement():
    history = [40, 45, 38, 42, 44, 39, 41, 43] * 2  # mu ~41.6, tight sigma
    assert is_outlier(41, [float(h) for h in history]) is False
    assert is_outlier(300, [float(h) for h in history]) is True
    # A collapse is never suspicious.
    assert is_outlier(2, [float(h) for h in history]) is False


def test_outlier_direction_inverted_for_lower_is_better():
    history = [float(h) for h in [40, 45, 38, 42, 44, 39, 41, 43] * 2]
    assert is_outlier(2, history, lower_is_better=True) is True
    assert is_outlier(300, history, lower_is_better=True) is False


def test_zero_variance_never_flags():
    assert is_outlier(300, [40.0] * 20) is False


async def _post_game(client, scores, date, mode="Shanghai"):
    resp = await client.post(
        "/games",
        json={
            "date": date,
            "mode": mode,
            "players": ["Alice", "Bob"],
            "scores": scores,
            "winner": "Alice" if scores[0] >= scores[1] else "Bob",
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def test_other_shanghai_variants_never_pollute_the_history(client):
    """Régression : un ShanghaiCrazy (cibles tirées dans 1-20+bull, ~3x le
    score d'un Shanghai classique cibles 1-7) était gelé « en attente
    d'homologation » dès la première partie, jugé contre l'historique
    classique de la famille Elo. Les échelles ne sont comparables qu'à
    ruleset identique (mode littéral + variante)."""
    for i in range(10):
        await _post_game(client, [40 + (i % 3), 38], f"2026-01-{i + 1:02d}T10:00:00Z")

    crazy = await _post_game(client, [280, 190], "2026-02-01T10:00:00Z", mode="ShanghaiCrazy")
    assert crazy["status"] == "COMPLETED"

    # Et le classement (Elo/stats) prend bien la partie en compte.
    board = (await client.get("/stats/leaderboard")).json()
    alice = next(r for r in board if r["name"] == "Alice")
    assert alice["games"] == 11


async def test_aberrant_game_is_frozen_and_skips_elo(client):
    # Build a stable 10-game history around ~40 points.
    for i in range(10):
        await _post_game(client, [40 + (i % 3), 38], f"2026-01-{i + 1:02d}T10:00:00Z")

    frozen = await _post_game(client, [400, 38], "2026-02-01T10:00:00Z")
    assert frozen["status"] == "PENDING_REVIEW"

    # The frozen game leaves no Elo trace and no ranked stats increment.
    board = (await client.get("/stats/leaderboard")).json()
    alice = next(r for r in board if r["name"] == "Alice")
    assert alice["games"] == 10  # not 11

    # A normal game right after still works.
    ok = await _post_game(client, [41, 38], "2026-02-02T10:00:00Z")
    assert ok["status"] == "COMPLETED"


async def test_trust_factor_never_leaks_through_api(client):
    resp = await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    await _post_game(client, [40, 38], "2026-01-01T10:00:00Z")

    me = (await client.get("/players/me", headers=headers)).json()
    board = (await client.get("/stats/leaderboard")).json()
    players = (await client.get("/players")).json()
    for payload in [me, *board, *players]:
        assert "trust_factor" not in payload
