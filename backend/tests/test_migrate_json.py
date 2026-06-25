import json

from app.core.db import async_session
from app.scripts import migrate_json as mj
from app.services import elo_recompute

SAMPLE_GAMES = [
    {
        "id": "g1",
        "date": "2026-01-01T10:00:00Z",
        "mode": "Cricket",
        "variant": "Normal",
        "players": ["Alice", "Bob"],
        "scores": [20, 10],
        "winner": "Alice",
        "duration": 100,
    },
    {
        "id": "g2",
        "date": "2026-01-02T10:00:00Z",
        "mode": "Shanghai",
        "variant": "Normal",
        "players": ["Alice", "Bob", "Carol"],
        "scores": [5, 6, 7],
        "winner": "Carol",
        "duration": 200,
    },
]


async def test_import_games_creates_players_and_games(client):
    imported, skipped, errors = await mj.import_games(SAMPLE_GAMES, dry_run=False)
    assert (imported, skipped, errors) == (2, 0, 0)

    assert len((await client.get("/games")).json()) == 2
    assert {p["name"] for p in (await client.get("/players")).json()} == {"Alice", "Bob", "Carol"}


async def test_import_games_is_idempotent():
    await mj.import_games(SAMPLE_GAMES, dry_run=False)
    imported, skipped, errors = await mj.import_games(SAMPLE_GAMES, dry_run=False)
    assert (imported, skipped, errors) == (0, 2, 0)


async def test_import_games_dry_run_writes_nothing(client):
    imported, skipped, errors = await mj.import_games(SAMPLE_GAMES, dry_run=True)
    assert (imported, skipped, errors) == (2, 0, 0)
    assert (await client.get("/games")).json() == []
    assert (await client.get("/players")).json() == []


async def test_recompute_all_elo_covers_every_player():
    await mj.import_games(SAMPLE_GAMES, dry_run=False)
    async with async_session() as session:
        player_count = await elo_recompute.recompute_all(session, dry_run=False)
    assert player_count == 3


async def test_recompute_all_elo_dry_run_writes_nothing(client):
    await mj.import_games(SAMPLE_GAMES, dry_run=False)
    async with async_session() as session:
        await elo_recompute.recompute_all(session, dry_run=True)

    leaderboard = (await client.get("/stats/leaderboard")).json()
    assert all(row["elo"] == 10000 for row in leaderboard)


async def test_main_cli_dry_run_end_to_end(tmp_path, monkeypatch):
    path = tmp_path / "games.json"
    path.write_text(json.dumps(SAMPLE_GAMES), encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["migrate_json", "--path", str(path), "--dry-run"])

    # await main() directly rather than asyncio.run(): the latter spins up a
    # second event loop, and the global async engine is already bound to
    # this session's loop (see conftest.py).
    await mj.main()
