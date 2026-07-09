import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import async_session
from app.models import EloHistory, Player, WebhookTarget as WebhookTargetModel
from app.models.elo import GLOBAL_SCOPE
from app.schemas.game import GameRead
from app.services import achievements as achievements_service
from app.services import games as games_service
from app.services.targets.base import GameEvent, NotificationTarget
from app.services.targets.discord import DiscordTarget
from app.services.targets.google_chat import GoogleChatTarget

logger = logging.getLogger(__name__)

_BUILDERS = {
    "google_chat": GoogleChatTarget,
    "discord": DiscordTarget,
}


async def load_targets(session: AsyncSession) -> dict[str, NotificationTarget]:
    rows = (
        await session.execute(select(WebhookTargetModel).where(WebhookTargetModel.enabled.is_(True)))
    ).scalars().all()
    configured: dict[str, str | None] = {r.target: r.url for r in rows}

    # Fall back to env vars for any target with no DB row yet, so a freshly
    # migrated deployment keeps notifying without an extra POST /webhooks call.
    settings = get_settings()
    configured.setdefault("google_chat", settings.google_chat_webhook)
    configured.setdefault("discord", settings.discord_webhook_url)

    return {
        name: _BUILDERS[name](url)
        for name, url in configured.items()
        if name in _BUILDERS and url
    }


async def notify(session: AsyncSession, event: GameEvent) -> None:
    """Fire-and-forget dispatch to every configured target — one target
    failing (bad URL, webhook deleted, ...) must never block the others
    or bubble up into the request/job that triggered the event."""
    for name, target in (await load_targets(session)).items():
        try:
            await target.send(event)
        except Exception:
            logger.exception("Notification target %s failed for event %r", name, event.type)


async def dispatch_game_finished(game: GameRead) -> None:
    """Runs as a FastAPI BackgroundTask, after the response is already sent —
    opens its own session since the request's (Depends(get_db)) is closed by
    then."""
    if game.is_casual:
        # A solo/practice session isn't "who won" bragging-rights content —
        # skip the recap the same way a casual game skips Elo.
        return

    async with async_session() as session:
        all_games = await games_service.list_all_games_raw(session)
        trophies = achievements_service.newly_unlocked_per_player(all_games, str(game.id))
        settings = get_settings()

        elo_rows = (
            await session.execute(
                select(Player.name, EloHistory.elo_before, EloHistory.elo_after, EloHistory.delta)
                .join(Player, Player.id == EloHistory.player_id)
                .where(EloHistory.game_id == game.id, EloHistory.scope == GLOBAL_SCOPE)
            )
        ).all()
        elo_by_player = {
            name: {"before": before, "after": after, "delta": delta}
            for name, before, after, delta in elo_rows
        }

        # League feed events (Epic 9) — written here, asynchronously, never
        # in the request path; a feed failure must not block the webhooks.
        try:
            from app.services.league_events import generate_events_for_game

            names = [p.name for p in game.players]
            rows = (await session.execute(select(Player).where(Player.name.in_(names)))).scalars().all()
            players_by_name = {p.name: p for p in rows}
            await generate_events_for_game(session, game, all_games, elo_by_player, players_by_name)
        except Exception:
            logger.exception("League feed event generation failed for game %s", game.id)

        players_sorted = sorted(game.players, key=lambda p: p.position)
        event = GameEvent(
            type="game_finished",
            data={
                "mode": game.mode,
                "variant": game.variant,
                "players": [p.name for p in players_sorted],
                "scores": [p.score for p in players_sorted],
                "winner": game.winner,
                "duration": game.duration,
                "trophies": trophies,
                "elo": elo_by_player,
                "dashboard_url": settings.dashboard_url,
            },
        )
        await notify(session, event)
