import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import async_session
from app.models import WebhookTarget as WebhookTargetModel
from app.schemas.game import GameRead
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
    event = GameEvent(
        type="game_finished",
        data={
            "mode": game.mode,
            "players": [p.name for p in game.players],
            "scores": [p.score for p in game.players],
            "winner": game.winner,
            "duration": game.duration,
        },
    )
    async with async_session() as session:
        await notify(session, event)
