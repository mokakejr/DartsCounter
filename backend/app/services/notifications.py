import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import async_session
from app.models import EloHistory, League, LeagueMember, Player, WebhookTarget as WebhookTargetModel
from app.models.elo import GLOBAL_SCOPE
from app.schemas.game import GameRead
from app.services import achievements as achievements_service
from app.services import games as games_service
from app.services.elo import lower_is_better_for
from app.services.elo_config import get_score_direction_map
from app.services.targets.base import GameEvent, NotificationTarget
from app.services.targets.discord import DiscordTarget
from app.services.targets.google_chat import GoogleChatTarget

logger = logging.getLogger(__name__)

_BUILDERS = {
    "google_chat": GoogleChatTarget,
    "discord": DiscordTarget,
}

# Shared by POST /webhooks/test and POST /leagues/{id}/webhook/test — a
# realistic game_finished card so the admin sees the real format land.
TEST_EVENT = GameEvent(
    type="game_finished",
    data={
        "mode": "Cricket",
        "players": ["Alice", "Bob"],
        "scores": [301, 250],
        "winner": "Alice",
        "duration": 125,
        "elo": {
            "Alice": {"before": 10182, "after": 10200, "delta": 18},
            "Bob": {"before": 9868, "after": 9850, "delta": -18},
        },
    },
)


def target_for_url(url: str) -> NotificationTarget:
    """League webhooks store a bare URL — infer the target kind from it.
    Discord webhook URLs are structurally recognizable; anything else is
    treated as a Google Chat webhook."""
    if "discord.com/api/webhooks" in url or "discordapp.com" in url:
        return DiscordTarget(url)
    return GoogleChatTarget(url)


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
    targets = await load_targets(session)
    if not targets:
        logger.warning("No webhook targets configured — event %r not sent anywhere", event.type)
        return
    for name, target in targets.items():
        try:
            await target.send(event)
        except Exception:
            logger.exception("Notification target %s failed for event %r", name, event.type)


async def league_targets_for_players(
    session: AsyncSession, player_names: list[str]
) -> dict[str, NotificationTarget]:
    """Webhooks of every league with ≥1 active member among the given
    players, deduped by URL (two leagues sharing a Chat space get one
    post). Keyed by league name for logging."""
    rows = (
        await session.execute(
            select(League)
            .join(LeagueMember, LeagueMember.league_id == League.id)
            .join(Player, Player.id == LeagueMember.player_id)
            .where(
                Player.name.in_(player_names),
                LeagueMember.is_active.is_(True),
                League.webhook_url.is_not(None),
            )
            .distinct()
        )
    ).scalars().all()

    targets: dict[str, NotificationTarget] = {}
    seen_urls: set[str] = set()
    for league in rows:
        if league.webhook_url in seen_urls:
            continue
        seen_urls.add(league.webhook_url)
        targets[league.name] = target_for_url(league.webhook_url)
    return targets


async def _any_league_webhook_configured(session: AsyncSession) -> bool:
    stmt = select(League.id).where(League.webhook_url.is_not(None)).limit(1)
    return (await session.execute(stmt)).first() is not None


async def dispatch_live_started(match) -> None:
    """Annonce « 🔴 LIVE » avec lien vers les gradins. Lancé via
    asyncio.create_task depuis le routeur live (la création du match ne doit
    JAMAIS attendre le webhook) — ouvre sa propre session, comme
    dispatch_game_finished. Le try/except englobant est obligatoire : dans
    une task nue, une exception ne remonterait nulle part."""
    try:
        settings = get_settings()
        event = GameEvent(
            type="live_started",
            data={
                "mode": match.mode,  # déjà un label d'affichage (MODE_LABEL côté front)
                "players": list(match.players),
                "remote": match.remote,
                "watch_url": f"{settings.counter_url.rstrip('/')}/watch/{match.id}",
            },
        )
        async with async_session() as session:
            # Même précédence de routage que dispatch_game_finished.
            league_targets = await league_targets_for_players(session, list(match.players))
            if league_targets:
                for league_name, target in league_targets.items():
                    try:
                        await target.send(event)
                    except Exception:
                        logger.exception(
                            "League webhook %r failed for live match %s", league_name, match.id
                        )
            elif not await _any_league_webhook_configured(session):
                await notify(session, event)
            else:
                logger.info(
                    "Live match %s: no league webhook matched %s — not announced",
                    match.id, list(match.players),
                )
    except Exception:
        logger.exception("live_started dispatch failed for match %s", match.id)


async def dispatch_game_finished(game: GameRead) -> None:
    """Runs as a FastAPI BackgroundTask, after the response is already sent —
    opens its own session since the request's (Depends(get_db)) is closed by
    then."""
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
        # Casual and frozen (PENDING_REVIEW) games are announced but never
        # feed the Panthéon, same as before the announce-everything change.
        if not game.is_casual and game.status == "COMPLETED":
            try:
                from app.services.league_events import generate_events_for_game

                names = [p.name for p in game.players]
                rows = (await session.execute(select(Player).where(Player.name.in_(names)))).scalars().all()
                players_by_name = {p.name: p for p in rows}
                await generate_events_for_game(session, game, all_games, elo_by_player, players_by_name)
            except Exception:
                logger.exception("League feed event generation failed for game %s", game.id)

        # Stored positions only distinguish winner (1) from the rest (2), so
        # rank the podium here: winner first — even when their score isn't
        # the extremum (e.g. Cricket closed on points) — then the others by
        # score, ascending for lower-is-better variants (Cut Throat).
        score_direction = await get_score_direction_map(session)
        lower_is_better = lower_is_better_for(game.mode, game.variant, score_direction)
        players_sorted = sorted(
            game.players,
            key=lambda p: (p.name != game.winner, p.score if lower_is_better else -p.score),
        )
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
                "status": game.status,
                "is_casual": game.is_casual,
                "dashboard_url": settings.dashboard_url,
            },
        )

        # Routage par ligue : chaque ligue dont un participant est membre
        # actif reçoit l'annonce sur son webhook. Tant qu'aucune ligue n'a
        # d'URL configurée, on retombe sur les cibles globales (transition
        # sans coupure le jour du déploiement).
        league_targets = await league_targets_for_players(
            session, [p.name for p in game.players]
        )
        if league_targets:
            for league_name, target in league_targets.items():
                try:
                    await target.send(event)
                except Exception:
                    logger.exception(
                        "League webhook %r failed for game %s", league_name, game.id
                    )
            logger.info(
                "Game %s announced to league webhook(s): %s",
                game.id, list(league_targets),
            )
        elif not await _any_league_webhook_configured(session):
            logger.info(
                "No league webhooks configured yet — falling back to global targets for game %s",
                game.id,
            )
            await notify(session, event)
        else:
            logger.info(
                "Game %s: no league webhook matched participants %s — not announced",
                game.id, [p.name for p in game.players],
            )
