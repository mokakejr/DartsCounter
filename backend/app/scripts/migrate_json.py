"""One-shot import of the legacy games.json into PostgreSQL.

Usage:
    uv run python -m app.scripts.migrate_json [--path PATH] [--dry-run]

Idempotent: each source game gets a UUID deterministically derived from its
original JSON `id` (uuid5), so re-running the script skips games already
imported instead of duplicating them. After importing, Elo is recomputed
from scratch for every player, in chronological order, over every game in
the database (not just the ones imported in this run).
"""

import argparse
import asyncio
import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy import delete, select

from app.core.db import async_session, engine
from app.models import EloHistory, Game, GamePlayer, Player
from app.services.elo import recompute_elo
from app.services.players import get_or_create_player

logger = logging.getLogger("migrate_json")

# Fixed namespace so the same source id always maps to the same Game.id across runs.
GAME_ID_NAMESPACE = uuid.UUID("c1b9d4f0-6e2a-4b8a-9b0a-2f6b9a8e9b8c")

DEFAULT_PATH = Path(__file__).resolve().parents[3] / "docs" / "data" / "games.json"


def game_uuid(raw_id: str) -> uuid.UUID:
    return uuid.uuid5(GAME_ID_NAMESPACE, str(raw_id))


def parse_date(raw: str) -> datetime:
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


async def import_one(session, cache: dict[str, Player], raw: dict) -> None:
    gid = game_uuid(raw["id"])
    players = raw.get("players", [])
    scores = raw.get("scores", [])
    winner_name = raw.get("winner")

    game = Game(
        id=gid,
        date=parse_date(raw["date"]),
        mode=raw["mode"],
        variant=raw.get("variant"),
        duration=raw.get("duration", 0),
        raw_data=raw,
    )
    session.add(game)

    for idx, name in enumerate(players):
        player = await get_or_create_player(session, name, cache)
        is_winner = name == winner_name
        session.add(
            GamePlayer(
                game_id=gid,
                player_id=player.id,
                score=scores[idx] if idx < len(scores) else 0,
                position=1 if is_winner else 2,
            )
        )
        if is_winner:
            game.winner_id = player.id

    if winner_name and winner_name not in players:
        logger.warning("Game %s: winner %r not in players %r", raw["id"], winner_name, players)


async def import_games(raw_games: list[dict], dry_run: bool) -> tuple[int, int, int]:
    imported = skipped = errors = 0

    async with async_session() as session:
        cache: dict[str, Player] = {}
        for raw in sorted(raw_games, key=lambda g: g["date"]):
            gid = game_uuid(raw["id"])
            exists = (await session.execute(select(Game.id).where(Game.id == gid))).scalar_one_or_none()
            if exists is not None:
                skipped += 1
                continue

            if dry_run:
                imported += 1
                logger.info("Would import game %s (%s/%s, %s)", raw["id"], raw["mode"], raw.get("variant"), raw["date"])
                continue

            try:
                async with session.begin_nested():
                    await import_one(session, cache, raw)
                imported += 1
            except Exception:
                errors += 1
                logger.exception("Failed to import game %s", raw.get("id"))

        if not dry_run:
            await session.commit()

    return imported, skipped, errors


async def recompute_all_elo(dry_run: bool) -> int:
    async with async_session() as session:
        rows = (
            await session.execute(select(Game.id, Game.raw_data).order_by(Game.date))
        ).all()
        games_for_elo = [
            {"id": gid, "players": raw_data.get("players", []), "winner": raw_data.get("winner")}
            for gid, raw_data in rows
        ]
        updates = recompute_elo(games_for_elo)

        if dry_run:
            return len({u.player_name for u in updates})

        players = (await session.execute(select(Player))).scalars().all()
        player_id_by_name = {p.name: p.id for p in players}

        await session.execute(delete(EloHistory))
        for u in updates:
            player_id = player_id_by_name.get(u.player_name)
            if player_id is None:
                continue
            session.add(
                EloHistory(
                    player_id=player_id,
                    game_id=u.game_id,
                    elo_before=u.elo_before,
                    elo_after=u.elo_after,
                    delta=u.delta,
                )
            )
        await session.commit()
        return len(player_id_by_name)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=None, help="Path to games.json")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen, write nothing")
    args = parser.parse_args()

    path = args.path or Path(os.environ.get("GAMES_JSON_PATH", DEFAULT_PATH))
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    raw_games = json.loads(path.read_text(encoding="utf-8"))
    logger.info("Loaded %d games from %s", len(raw_games), path)

    imported, skipped, errors = await import_games(raw_games, args.dry_run)
    verb = "would import" if args.dry_run else "imported"
    logger.info("%d games %s, %d skipped, %d errors", imported, verb, skipped, errors)

    if errors == 0:
        player_count = await recompute_all_elo(args.dry_run)
        verb = "would recompute" if args.dry_run else "recomputed"
        logger.info("Elo %s for %d players", verb, player_count)
    else:
        logger.warning("Skipping Elo recompute because %d game(s) failed to import", errors)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
