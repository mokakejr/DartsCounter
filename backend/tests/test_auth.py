from app.core.config import get_settings

DEFAULT_PW = get_settings().default_player_password


async def test_signup_new_name_creates_player(client):
    resp = await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["player"]["name"] == "Alice"
    assert body["access_token"]

    players = (await client.get("/players")).json()
    assert {p["name"] for p in players} == {"Alice"}


async def test_signup_existing_name_rejected(client):
    # The counter app creates a player just by recording a game under that name.
    # Names are unique and never reused, so signing up under it is rejected —
    # that player logs in with the default password instead.
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

    resp = await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    assert resp.status_code == 409

    # No duplicate row was created.
    players = (await client.get("/players")).json()
    assert {p["name"] for p in players} == {"Alice", "Bob"}


async def test_signup_name_already_claimed_is_rejected(client):
    await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    resp = await client.post("/auth/signup", json={"name": "Alice", "password": "differentpw"})
    assert resp.status_code == 409


async def test_login_success(client):
    await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    resp = await client.post("/auth/login", json={"name": "Alice", "password": "hunter22"})
    assert resp.status_code == 200
    assert resp.json()["player"]["name"] == "Alice"


async def test_login_wrong_password_rejected(client):
    await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    resp = await client.post("/auth/login", json={"name": "Alice", "password": "wrong"})
    assert resp.status_code == 401


async def test_login_unknown_name_rejected(client):
    resp = await client.post("/auth/login", json={"name": "Ghost", "password": "whatever"})
    assert resp.status_code == 401


async def test_game_created_player_logs_in_with_default_password(client):
    # A player auto-created from a counter game gets the shared default password
    # so they can log in straight away.
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

    ok = await client.post("/auth/login", json={"name": "Alice", "password": DEFAULT_PW})
    assert ok.status_code == 200
    assert ok.json()["player"]["name"] == "Alice"

    wrong = await client.post("/auth/login", json={"name": "Alice", "password": "not-the-default"})
    assert wrong.status_code == 401


async def test_change_password_from_profile(client):
    signup = await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    token = signup.json()["access_token"]

    patch = await client.patch(
        "/players/me",
        json={"password": "brand-new-pw"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch.status_code == 200

    # Old password no longer works; the new one does.
    assert (await client.post("/auth/login", json={"name": "Alice", "password": "hunter22"})).status_code == 401
    assert (await client.post("/auth/login", json={"name": "Alice", "password": "brand-new-pw"})).status_code == 200
