"""One-shot deletion of a single game from PostgreSQL, with full Elo rebuild.

Usage:
    uv run python -m app.scripts.delete_game --winner NAME [--date YYYY-MM-DD] --dry-run
    uv run python -m app.scripts.delete_game --id UUID

Select the game by --id, or by --winner (and optionally --date) to find it.
--dry-run lists matching games and writes nothing — run it first to confirm
the id. Deletion refuses to proceed when more than one game matches without
an explicit --id, so you can't wipe the wrong game.

After deleting, Elo is fully recomputed from the remaining history (same
recompute_all the migrate script uses — it wipes elo_history + player_ratings
and replays every remaining game), so ratings/stats are correct without it.
Dashboard stats/badges are derived live from the games list, so they fix
themselves once the game is gone.
"""

import argparse
import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.core.db import async_session, engine
from app.models import EloHistory, Game, GamePlayer
from app.services import elo_recompute

logger = logging.getLogger("delete_game")


async def find_games(session, *, game_id, winner, date):
    stmt = select(Game).options(
        selectinload(Game.players).selectinload(GamePlayer.player),
        selectinload(Game.winner),
    )
    if game_id is not None:
        stmt = stmt.where(Game.id == game_id)
    if winner is not None:
        stmt = stmt.where(Game.winner.has(name=winner))
    if date is not None:
        start = datetime(date.year, date.month, date.day, tzinfo=timezone.utc)
        stmt = stmt.where(Game.date >= start, Game.date < start + timedelta(days=1))
    return (await session.execute(stmt.order_by(Game.date))).scalars().all()


def describe(g: Game) -> str:
    return (
        f"{g.id} | {g.date.isoformat()} | {g.mode}/{g.variant} | "
        f"players={[gp.player.name for gp in g.players]} | "
        f"winner={g.winner.name if g.winner else None}"
    )


async def run(game_id, winner, date, dry_run: bool) -> None:
    async with async_session() as session:
        matches = await find_games(session, game_id=game_id, winner=winner, date=date)

        if not matches:
            logger.warning("No game matched the given criteria — nothing to do.")
            return

        logger.info("%d game(s) matched:", len(matches))
        for g in matches:
            logger.info("  %s", describe(g))

        if dry_run:
            logger.info("Dry-run: nothing written.")
            return

        if len(matches) > 1 and game_id is None:
            logger.error(
                "%d games matched but no --id given. Refusing to delete an ambiguous "
                "match; re-run with --id <UUID> to pick one.",
                len(matches),
            )
            return

        target = matches[0]
        gid = target.id
        logger.info("Deleting game %s", gid)
        await session.execute(delete(EloHistory).where(EloHistory.game_id == gid))
        await session.execute(delete(GamePlayer).where(GamePlayer.game_id == gid))
        await session.execute(delete(Game).where(Game.id == gid))
        await session.commit()

    # Fresh session for the full rebuild (it wipes + replays everything).
    async with async_session() as session:
        player_count = await elo_recompute.recompute_all(session)
    logger.info("Elo recomputed for %d players. Done.", player_count)


async def _amain(game_id, winner, date, dry_run: bool) -> None:
    try:
        await run(game_id, winner, date, dry_run)
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", type=uuid.UUID, default=None, help="Game UUID to delete")
    parser.add_argument("--winner", default=None, help="Filter by winner name")
    parser.add_argument("--date", default=None, help="Filter by date (YYYY-MM-DD, UTC)")
    parser.add_argument("--dry-run", action="store_true", help="List matches, write nothing")
    args = parser.parse_args()

    if args.id is None and args.winner is None and args.date is None:
        parser.error("provide at least one of --id, --winner, --date")

    date = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else None

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    asyncio.run(_amain(args.id, args.winner, date, args.dry_run))


if __name__ == "__main__":
    main()
