"""Grant/revoke the is_admin flag on a player — there's no API endpoint for
this on purpose (every admin-gated endpoint requires an existing admin, so
the very first one has to be set this way).

Usage:
    uv run python -m app.scripts.set_admin <name> [--revoke]
"""

import argparse
import asyncio

from sqlalchemy import select

from app.core.db import async_session, engine
from app.models import Player


async def set_admin(name: str, is_admin: bool) -> bool:
    async with async_session() as session:
        player = (await session.execute(select(Player).where(Player.name == name))).scalar_one_or_none()
        if player is None:
            return False
        player.is_admin = is_admin
        await session.commit()
        return True


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", help="Player name (username)")
    parser.add_argument("--revoke", action="store_true", help="Remove admin instead of granting it")
    args = parser.parse_args()

    found = await set_admin(args.name, not args.revoke)
    if not found:
        print(f"No player named {args.name!r}")
    else:
        print(f"{args.name}: is_admin = {not args.revoke}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
