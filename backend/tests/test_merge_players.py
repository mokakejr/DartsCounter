from sqlalchemy import select

from app.core.db import async_session
from app.models import EloHistory, Game, GamePlayer, Player, PlayerRating
from app.scripts.merge_players import merge_players


async def _play(client, **kwargs):
    payload = {
        "date": "2026-01-01T10:00:00Z",
        "mode": "Cricket",
        "players": ["alice", "Bob"],
        "scores": [20, 10],
        "winner": "alice",
    }
    payload.update(kwargs)
    return await client.post("/games", json=payload)


async def test_merge_repoints_games_and_rewrites_raw_data(client):
    await _play(client, date="2026-01-01T10:00:00Z")
    await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})

    result = await merge_players("Alice", "alice", dry_run=False)
    assert result == {"games_repointed": 1, "games_skipped_conflict": 0, "absorb_deleted": True}

    async with async_session() as session:
        absorb = (await session.execute(select(Player).where(Player.name == "alice"))).scalar_one_or_none()
        assert absorb is None

        keep = (await session.execute(select(Player).where(Player.name == "Alice"))).scalar_one()
        gp = (await session.execute(select(GamePlayer).where(GamePlayer.player_id == keep.id))).scalar_one()
        assert gp.score == 20

        game = await session.get(Game, gp.game_id)
        assert game.raw_data["players"] == ["Alice", "Bob"]
        assert game.raw_data["winner"] == "Alice"
        assert game.winner_id == keep.id


async def test_merge_dry_run_writes_nothing(client):
    await _play(client)
    await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})

    result = await merge_players("Alice", "alice", dry_run=True)
    assert result == {"games_repointed": 1, "games_skipped_conflict": 0, "absorb_deleted": False}

    async with async_session() as session:
        absorb = (await session.execute(select(Player).where(Player.name == "alice"))).scalar_one_or_none()
        assert absorb is not None  # untouched


async def test_merge_skips_game_where_both_played_and_keeps_absorb(client):
    # A genuinely ambiguous case: "alice" and "Alice" both appear as
    # separate participants in the same game (e.g. a typo mid-game).
    await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    await _play(
        client,
        players=["alice", "Alice", "Bob"],
        scores=[20, 15, 10],
        winner="alice",
    )

    result = await merge_players("Alice", "alice", dry_run=False)
    assert result == {"games_repointed": 0, "games_skipped_conflict": 1, "absorb_deleted": False}

    async with async_session() as session:
        # Still exists — deleting it would have orphaned the conflicting game.
        absorb = (await session.execute(select(Player).where(Player.name == "alice"))).scalar_one_or_none()
        assert absorb is not None

        game = (await session.execute(select(Game))).scalar_one()
        assert game.raw_data["players"] == ["alice", "Alice", "Bob"]  # untouched
        assert game.winner_id == absorb.id  # untouched, not silently reassigned to keep


async def test_merge_unknown_player_raises(client):
    await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})
    try:
        await merge_players("Alice", "Nobody", dry_run=True)
        assert False, "expected ValueError"
    except ValueError:
        pass


async def test_merge_then_recompute_rebuilds_elo_under_merged_history(client):
    await _play(client, date="2026-01-01T10:00:00Z")
    await _play(client, date="2026-01-02T10:00:00Z", players=["alice", "Bob"], scores=[20, 10], winner="alice")
    await client.post("/auth/signup", json={"name": "Alice", "password": "hunter22"})

    await merge_players("Alice", "alice", dry_run=False)

    from app.services import elo_recompute

    async with async_session() as session:
        player_count = await elo_recompute.recompute_all(session)
    assert player_count == 2  # Alice + Bob, not a phantom third "alice"

    leaderboard = (await client.get("/stats/leaderboard")).json()
    board = {row["name"]: row for row in leaderboard}
    assert board["Alice"]["games"] == 2
    assert board["Alice"]["elo"] > board["Bob"]["elo"]
    assert "alice" not in board
