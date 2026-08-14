import pytest

pytestmark = pytest.mark.usefixtures("fake_httpx")


async def test_configure_and_list_webhook(client):
    resp = await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})
    assert resp.status_code == 201
    assert resp.json()["target"] == "google_chat"

    listed = (await client.get("/webhooks")).json()
    assert len(listed) == 1
    assert listed[0]["url"] == "https://chat.example/x"


async def test_configure_webhook_upserts_by_target(client):
    await client.post("/webhooks", json={"target": "discord", "url": "https://discord.example/old"})
    await client.post("/webhooks", json={"target": "discord", "url": "https://discord.example/new"})

    listed = (await client.get("/webhooks")).json()
    assert len(listed) == 1
    assert listed[0]["url"] == "https://discord.example/new"


async def test_test_webhook_sends_to_configured_target(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})

    resp = await client.post("/webhooks/test", json={"target": "google_chat"})
    assert resp.status_code == 202
    # Aperçu complet : la carte de début puis le résultat, dans le même fil.
    assert len(fake_httpx.calls) == 2
    urls = [u for u, _ in fake_httpx.calls]
    bodies = [b for _, b in fake_httpx.calls]
    assert all(u.startswith("https://chat.example/x") for u in urls)
    assert all("cardsV2" in b for b in bodies)  # les deux utilisent le format cardsV2
    assert bodies[0]["thread"]["threadKey"] == bodies[1]["thread"]["threadKey"]


async def test_test_webhook_404_when_not_configured(client):
    resp = await client.post("/webhooks/test", json={"target": "discord"})
    assert resp.status_code == 404


async def test_test_webhook_502_on_send_failure(client, fake_httpx):
    await client.post("/webhooks", json={"target": "google_chat", "url": "https://chat.example/x"})
    fake_httpx.fail = True

    resp = await client.post("/webhooks/test", json={"target": "google_chat"})
    assert resp.status_code == 502


async def test_disabled_target_is_not_used(client):
    await client.post("/webhooks", json={"target": "discord", "url": "https://discord.example/x", "enabled": False})

    resp = await client.post("/webhooks/test", json={"target": "discord"})
    assert resp.status_code == 404
