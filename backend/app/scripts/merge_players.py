"""Merge a duplicate player into a canonical one — e.g. an old free-text
"alice" recorded by the counter app before the account system existed,
into the real "Alice" account.

Repoints every game_players row, games.winner_id, AND the games.raw_data
JSONB's players/winner name fields (the actual source elo_recompute reads
from — see app/services/elo_recompute.py) from the absorbed player onto
the keeper, then deletes the absorbed player row.

Elo is NOT hand-merged — there's no sound way to merge two separate rating
trajectories after the fact, and the app already treats Elo as fully
re-derivable from game history. Run the recompute after merging (pass
--recompute, or do it later via POST /elo/recompute or migrate_json.py).

The KEEP player's own profile (name, password, avatar, accent color, admin
flag, ...) is left untouched — only the ABSORB player's game history moves
over. Pick the order of arguments so KEEP is whichever account should
survive with its profile intact.

If both players appear in the *same* game (the same human played under both
names in one sitting — rare, but possible), that one game is skipped with a
warning rather than guessed at; resolve it by hand first.

Usage:
    uv run python -m app.scripts.merge_players <keep> <absorb> [--dry-run] [--recompute]
"""

import argparse
import asyncio
import logging

from sqlalchemy import delete, select, update

from app.core.db import async_session, engine
from app.models import EloHistory, Game, GamePlayer, Player, PlayerRating
from app.services import elo_recompute

logger = logging.getLogger("merge_players")


async def merge_players(keep_name: str, absorb_name: str, dry_run: bool) -> dict:
    async with async_session() as session:
        keep = (await session.execute(select(Player).where(Player.name == keep_name))).scalar_one_or_none()
        absorb = (await session.execute(select(Player).where(Player.name == absorb_name))).scalar_one_or_none()

        if keep is None:
            raise ValueError(f"No player named {keep_name!r}")
        if absorb is None:
            raise ValueError(f"No player named {absorb_name!r}")
        if keep.id == absorb.id:
            raise ValueError("keep and absorb are the same player")

        absorb_game_ids = set(
            (await session.execute(select(GamePlayer.game_id).where(GamePlayer.player_id == absorb.id)))
            .scalars()
            .all()
        )
        keep_game_ids = set(
            (await session.execute(select(GamePlayer.game_id).where(GamePlayer.player_id == keep.id)))
            .scalars()
            .all()
        )

        conflicts = absorb_game_ids & keep_game_ids
        to_merge = absorb_game_ids - conflicts

        if conflicts:
            logger.warning(
                "%d game(s) have both %r and %r as separate participants — skipped, resolve by hand: %s",
                len(conflicts), absorb_name, keep_name, sorted(str(g) for g in conflicts),
            )

        if dry_run:
            return {
                "games_repointed": len(to_merge),
                "games_skipped_conflict": len(conflicts),
                "absorb_deleted": False,
            }

        for game_id in to_merge:
            gp = await session.get(GamePlayer, (game_id, absorb.id))
            gp.player_id = keep.id

            game = await session.get(Game, game_id)
            raw = dict(game.raw_data)
            raw["players"] = [keep_name if p == absorb_name else p for p in raw.get("players", [])]
            if raw.get("winner") == absorb_name:
                raw["winner"] = keep_name
            game.raw_data = raw

        # Scoped to to_merge only — a conflicting game's winner_id must not
        # be touched, since "keep" may have been a separate, independent
        # participant in it with their own unrelated result.
        await session.execute(
            update(Game)
            .where(Game.winner_id == absorb.id, Game.id.in_(to_merge))
            .values(winner_id=keep.id)
        )

        await session.execute(delete(EloHistory).where(EloHistory.player_id == absorb.id))
        await session.execute(delete(PlayerRating).where(PlayerRating.player_id == absorb.id))

        # absorb can only be deleted once every game_players row pointing at
        # it is gone — a conflicting game's row (deliberately left alone
        # above) would otherwise violate that foreign key.
        absorb_deleted = not conflicts
        if absorb_deleted:
            await session.delete(absorb)
        await session.commit()

        return {
            "games_repointed": len(to_merge),
            "games_skipped_conflict": len(conflicts),
            "absorb_deleted": absorb_deleted,
        }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("keep", help="Player name to keep (its profile/account survives untouched)")
    parser.add_argument("absorb", help="Duplicate player name to merge in and delete")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen, write nothing")
    parser.add_argument(
        "--recompute", action="store_true", help="Run the full Elo recompute immediately after merging"
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    result = await merge_players(args.keep, args.absorb, args.dry_run)
    verb = "would repoint" if args.dry_run else "repointed"
    logger.info(
        "%d game(s) %s from %r to %r, %d skipped (both played in the same game)",
        result["games_repointed"], verb, args.absorb, args.keep, result["games_skipped_conflict"],
    )
    if result["absorb_deleted"]:
        logger.info("%r deleted", args.absorb)
    elif result["games_skipped_conflict"] and not args.dry_run:
        logger.warning(
            "%r NOT deleted — %d game(s) still reference it (the conflicts above). "
            "Resolve those by hand, then re-run this command to finish.",
            args.absorb, result["games_skipped_conflict"],
        )

    if args.recompute and not args.dry_run:
        async with async_session() as session:
            player_count = await elo_recompute.recompute_all(session)
        logger.info("Elo recomputed for %d players", player_count)
    elif not args.dry_run:
        logger.info("Run POST /elo/recompute (or migrate_json.py) next to rebuild Elo from the corrected history.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
