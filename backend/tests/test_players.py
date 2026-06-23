async def _signup(client, name="Alice", password="hunter22"):
    resp = await client.post("/auth/signup", json={"name": name, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def test_list_players_created_via_games(client):
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

    resp = await client.get("/players")
    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()}
    assert names == {"Alice", "Bob"}


async def test_get_or_create_player_does_not_duplicate(client):
    for _ in range(3):
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

    players = (await client.get("/players")).json()
    assert len(players) == 2


async def test_get_me_requires_auth(client):
    resp = await client.get("/players/me")
    assert resp.status_code == 401


async def test_get_me_returns_current_player(client):
    token = await _signup(client)
    resp = await client.get("/players/me", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["name"] == "Alice"


async def test_patch_profile_updates_display_name_and_color(client):
    token = await _signup(client)
    resp = await client.patch(
        "/players/me",
        json={"display_name": "Al", "accent_color": "#34D399"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["display_name"] == "Al"
    assert body["accent_color"] == "#34D399"
    assert body["name"] == "Alice"  # untouched


async def test_patch_profile_renames_username(client):
    token = await _signup(client)
    resp = await client.patch("/players/me", json={"name": "Alicia"}, headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["name"] == "Alicia"


async def test_patch_profile_name_conflict_rejected(client):
    await _signup(client, "Bob", "hunter22")
    token = await _signup(client, "Alice", "hunter22")
    resp = await client.patch("/players/me", json={"name": "Bob"}, headers=_auth(token))
    assert resp.status_code == 409


async def test_patch_profile_invalid_color_rejected(client):
    token = await _signup(client)
    resp = await client.patch("/players/me", json={"accent_color": "red"}, headers=_auth(token))
    assert resp.status_code == 422


async def test_upload_avatar_image(client):
    from io import BytesIO

    from PIL import Image

    token = await _signup(client)
    buf = BytesIO()
    Image.new("RGB", (50, 50), color="red").save(buf, format="PNG")
    buf.seek(0)

    resp = await client.post(
        "/players/me/image",
        params={"slot": "avatar"},
        files={"file": ("avatar.png", buf, "image/png")},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["avatar_url"]
    assert body["avatar_url"].endswith(".webp")


async def test_upload_image_rejects_non_image(client):
    token = await _signup(client)
    resp = await client.post(
        "/players/me/image",
        params={"slot": "flight"},
        files={"file": ("not-an-image.txt", b"hello world", "text/plain")},
        headers=_auth(token),
    )
    assert resp.status_code == 400


async def test_ping_requires_auth(client):
    resp = await client.post("/players/ping")
    assert resp.status_code == 401


async def test_ping_dispatches_and_then_cooldowns(client, fake_httpx, fake_redis):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})
    token = await _signup(client)

    first = await client.post("/players/ping", headers=_auth(token))
    assert first.status_code == 202
    assert len(fake_httpx.calls) == 1
    assert "Alice" in fake_httpx.calls[0][1]["text"]

    second = await client.post("/players/ping", headers=_auth(token))
    assert second.status_code == 429
    assert second.json()["detail"]["retry_after_seconds"] > 0
    assert len(fake_httpx.calls) == 1  # not re-sent
