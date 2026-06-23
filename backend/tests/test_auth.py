async def test_signup_new_name_creates_player(client):
    resp = await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["player"]["name"] == "Alice"
    assert body["access_token"]

    players = (await client.get("/players")).json()
    assert {p["name"] for p in players} == {"Alice"}


async def test_signup_claims_existing_unclaimed_player(client):
    # The counter app creates an anonymous, password-less player just by
    # recording a game under that name.
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
    assert resp.status_code == 201

    # Claiming the name didn't create a duplicate player row.
    players = (await client.get("/players")).json()
    assert len(players) == 2


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


async def test_login_rejected_for_player_with_no_account(client):
    # Anonymous player, never signed up — no password to check against.
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
    resp = await client.post("/auth/login", json={"name": "Alice", "password": "anything"})
    assert resp.status_code == 401
