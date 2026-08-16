"""D4 — endpoint GET /stats/achievements.

Le calcul lui-même (détenteurs, rareté, progression, value) est couvert
exhaustivement par la parité JS↔Python dans test_achievements_parity.py. Ici on
vérifie l'enveloppe HTTP : route, résolution du paramètre `season`, forme de la
réponse.
"""

import uuid

_TROPHY_KEYS = {
    "id", "cat", "ico", "name", "desc",
    "earners", "unlocked", "rarity", "progress", "my_value",
}


async def test_achievements_empty_roster(client):
    resp = await client.get("/stats/achievements")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 81
    assert all(t["unlocked"] is False for t in data)
    assert all(t["rarity"] is None for t in data)
    assert all(t["earners"] == [] for t in data)
    assert _TROPHY_KEYS <= set(data[0])


async def test_achievements_season_all(client):
    resp = await client.get("/stats/achievements", params={"season": "all"})
    assert resp.status_code == 200
    assert len(resp.json()) == 81


async def test_achievements_bad_season_is_422(client):
    resp = await client.get("/stats/achievements", params={"season": "pas-un-uuid"})
    assert resp.status_code == 422


async def test_achievements_unknown_season_is_404(client):
    resp = await client.get("/stats/achievements", params={"season": str(uuid.uuid4())})
    assert resp.status_code == 404
