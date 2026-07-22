"""One-shot full Elo rebuild — same recompute_all as POST /elo/recompute.

Usage:
    uv run python -m app.scripts.recompute_elo

Run by the deploy workflows right after `alembic upgrade head`: data
migrations that change which games feed Elo (e.g. un-freezing wrongly
flagged games) and engine tweaks would otherwise leave ratings stale until
an admin remembers to hit the recompute endpoint. Elo is fully re-derivable
from game history, so replaying everything at deploy time is always safe.
"""

import asyncio
import logging

from app.core.db import async_session, engine
from app.services import elo_recompute

logger = logging.getLogger("recompute_elo")


async def _amain() -> None:
    try:
        async with async_session() as session:
            player_count = await elo_recompute.recompute_all(session)
        logger.info("Elo recomputed for %d players. Done.", player_count)
    finally:
        await engine.dispose()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    asyncio.run(_amain())


if __name__ == "__main__":
    main()
