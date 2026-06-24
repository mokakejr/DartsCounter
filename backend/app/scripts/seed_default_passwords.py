"""Back-fill the default password onto pre-existing account-less players.

Usage:
    uv run python -m app.scripts.seed_default_passwords [--dry-run]

Players created before the default-password change (e.g. imported from the
legacy games.json) have a NULL password_hash and therefore cannot log in. This
one-shot, idempotent script sets `settings.default_player_password` on exactly
those rows so they can sign in and personalise it from their profile.

Safety: it ONLY touches players where password_hash IS NULL. A player who has
already set a password is never modified.
"""

import argparse
import asyncio
import logging

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import async_session, engine
from app.core.security import hash_password
from app.models import Player

logger = logging.getLogger("seed_default_passwords")


async def seed(dry_run: bool) -> int:
    async with async_session() as session:
        rows = (
            await session.execute(select(Player).where(Player.password_hash.is_(None)))
        ).scalars().all()

        if not dry_run:
            default_hash = hash_password(get_settings().default_player_password)
            for player in rows:
                player.password_hash = default_hash
            await session.commit()

        for player in rows:
            logger.info("%s default password → %s", "would set" if dry_run else "set", player.name)
        return len(rows)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print what would change, write nothing")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    count = await seed(args.dry_run)
    verb = "would seed" if args.dry_run else "seeded"
    logger.info("%s default password for %d account-less player(s)", verb, count)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
