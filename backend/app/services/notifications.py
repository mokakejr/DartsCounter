import asyncio
import logging
import time

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import async_session
from app.models import EloHistory, League, LeagueMember, Player, WebhookTarget as WebhookTargetModel
from app.models.elo import GLOBAL_SCOPE, PlayerRating
from app.models.game import SOLO_MODES
from app.schemas.game import GameRead
from app.services import achievements as achievements_service
from app.services import chat_threads
from app.services import games as games_service
from app.services import stats as stats_service
from app.services.elo import lower_is_better_for, rank_for_rating
from app.services.elo_config import get_engine_config, get_score_direction_map
from app.services.recap import mode_label
from app.services.targets.base import GameEvent, NotificationTarget
from app.services.targets.discord import DiscordTarget
from app.services.targets.google_chat import GoogleChatTarget

logger = logging.getLogger(__name__)

# Une partie lancée par erreur et quittée dans la foulée ne doit jamais
# atterrir dans l'espace Chat : on laisse passer ce délai avant d'annoncer,
# puis on vérifie que la partie tourne toujours. Négligeable sur une partie
# de 10 minutes, décisif contre le bruit.
ANNOUNCE_DELAY_SECONDS = 30

# Le front envoie au registre live le LIBELLÉ du mode (PlaySetup.jsx), pas la
# clé stockée en base — il faut couvrir les deux pour filtrer le solo.
_SOLO_MODE_NAMES = SOLO_MODES | {mode_label(m) for m in SOLO_MODES}

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
        "variant": "Cut Throat",
        "players": ["Alice", "Bob"],
        "scores": [301, 250],
        "winner": "Alice",
        "duration": 125,
        "elo": {
            "Alice": {"before": 10182, "after": 10200, "delta": 18},
            "Bob": {"before": 9868, "after": 9850, "delta": -18},
        },
        "rank_changes": {"Alice": {"rank": "Diamant I", "up": True}},
    },
)


def build_test_events() -> list[GameEvent]:
    """Les deux cartes d'une partie, dans le même fil : l'admin voit
    exactement ce qui atterrira dans l'espace, threading compris. La clé
    change à chaque test pour ne pas empiler les essais dans un seul fil."""
    thread_key = f"dc-test-{int(time.time())}"
    settings = get_settings()
    started = GameEvent(
        type="game_started",
        data={
            "mode": "Cricket",
            "variant": "Cut Throat",
            "players": [
                {"name": "Alice", "rating": 10182, "rank": "Diamant II"},
                {"name": "Bob", "rating": 9868, "rank": "Platine III"},
            ],
            "rivalry": {"a": "Alice", "b": "Bob", "a_wins": 7, "b_wins": 4, "a_win_probability": 0.62},
            "watch_url": f"{settings.counter_url}/watch/demo",
            "thread_key": thread_key,
        },
    )
    finished = GameEvent(
        type="game_finished",
        data={**TEST_EVENT.data, "dashboard_url": settings.dashboard_url, "thread_key": thread_key},
    )
    return [started, finished]


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


async def dispatch_to_leagues(
    session: AsyncSession, event: GameEvent, player_names: list[str], ref: str
) -> None:
    """Routage par ligue : chaque ligue dont un participant est membre actif
    reçoit l'annonce sur son webhook. Tant qu'aucune ligue n'a d'URL
    configurée, on retombe sur les cibles globales (transition sans coupure le
    jour du déploiement). `ref` ne sert qu'aux logs."""
    league_targets = await league_targets_for_players(session, player_names)
    if league_targets:
        for league_name, target in league_targets.items():
            try:
                await target.send(event)
            except Exception:
                logger.exception("League webhook %r failed for %s", league_name, ref)
        logger.info("%s announced to league webhook(s): %s", ref, list(league_targets))
    elif not await _any_league_webhook_configured(session):
        logger.info("No league webhooks configured yet — falling back to global targets for %s", ref)
        await notify(session, event)
    else:
        logger.info("%s: no league webhook matched participants %s — not announced", ref, player_names)


def _resolve_thread_key(live_match_id: str | None, player_names: list[str]) -> str | None:
    """Fil dans lequel poster le résultat : celui ouvert par la carte de début
    de la partie. À défaut (match live purgé, partie remontée par la file
    offline), on retombe sur le dernier fil de ces joueurs — et sinon sur
    rien du tout, ce qui poste un message racine comme avant."""
    from app.services import live as live_service

    if live_match_id:
        match = live_service.get_match(live_match_id)
        if match is not None and match.thread_key:
            return match.thread_key
    return chat_threads.peek(player_names)


async def dispatch_game_finished(game: GameRead, live_match_id: str | None = None) -> None:
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
        # Le passage de palier ("⬆️ passe Diamant II") se lit sur le rang
        # avant/après, pas sur le delta brut — d'où la config du moteur ici.
        elo_config = await get_engine_config(session)
        rank_changes = {
            name: {"rank": rank_for_rating(e["after"], elo_config), "up": e["delta"] >= 0}
            for name, e in elo_by_player.items()
            if rank_for_rating(e["after"], elo_config) != rank_for_rating(e["before"], elo_config)
        }

        player_names = [p.name for p in game.players]
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
                "rank_changes": rank_changes,
                "status": game.status,
                "is_casual": game.is_casual,
                "dashboard_url": settings.dashboard_url,
                # Réponse sous la carte « ça commence » de cette partie.
                "thread_key": _resolve_thread_key(live_match_id, player_names),
            },
        )

        await dispatch_to_leagues(session, event, player_names, f"Game {game.id}")
        # Relance la fenêtre de regroupement : la revanche enchaînée dans les
        # 10 minutes restera dans ce fil au lieu d'en ouvrir un nouveau.
        chat_threads.touch(player_names)


# --- début de partie --------------------------------------------------------


def should_announce_start(match) -> bool:
    """Toutes les parties ne méritent pas de sortir de l'espace Chat : on
    n'annonce que ce qui vaut le coup d'être regardé."""
    if len(match.players) < 2:
        return False
    if match.mode in _SOLO_MODE_NAMES:
        return False
    return not (match.options or {}).get("isCasual")


async def _line_up(session: AsyncSession, names: list[str]) -> list[dict]:
    """Elo global + rang de chaque joueur, dans l'ordre du match. Un joueur
    inconnu de la base (première partie) sort avec rating=None."""
    config = await get_engine_config(session)
    rows = (
        await session.execute(
            select(Player.name, PlayerRating.rating)
            .outerjoin(
                PlayerRating,
                and_(PlayerRating.player_id == Player.id, PlayerRating.scope == GLOBAL_SCOPE),
            )
            .where(Player.name.in_(names))
        )
    ).all()
    ratings = {name: rating for name, rating in rows}
    return [
        {
            "name": name,
            "rating": ratings.get(name),
            "rank": rank_for_rating(ratings[name], config) if ratings.get(name) is not None else None,
        }
        for name in names
    ]


async def dispatch_game_started(match, delay: float | None = None) -> None:
    """Carte racine du fil de la partie, avec le lien vers les gradins.

    Tourne en tâche de fond : le lancement d'une partie ne doit jamais
    attendre un webhook. `delay` est résolu à l'appel (et non dans la
    signature) pour que les tests puissent neutraliser l'attente."""
    if match.announced or not should_announce_start(match):
        return
    if delay is None:
        delay = ANNOUNCE_DELAY_SECONDS
    # Réservation immédiate : les trois déclencheurs (création locale, READY
    # REST, READY WS) peuvent arriver en même temps.
    match.announced = True

    if delay:
        await asyncio.sleep(delay)
    if match.finished or match.aborted:
        # Faux départ : rien n'est parti, on rend la main pour qu'une reprise
        # de la partie puisse encore l'annoncer.
        match.announced = False
        return

    try:
        async with async_session() as session:
            settings = get_settings()
            rivalry = None
            if len(match.players) == 2:
                pairs = await stats_service.get_head_to_head(session, match.players)
                rivalry = pairs[0] if pairs else None

            match.thread_key = chat_threads.thread_key_for(match.players, match.id)
            event = GameEvent(
                type="game_started",
                data={
                    "mode": match.mode,
                    "variant": match.variant,
                    "players": await _line_up(session, match.players),
                    "rivalry": rivalry,
                    "remote": match.remote,
                    "watch_url": f"{settings.counter_url}/watch/{match.id}",
                    "thread_key": match.thread_key,
                },
            )
            await dispatch_to_leagues(session, event, match.players, f"Live match {match.id}")
    except Exception:
        # Une annonce ratée ne doit jamais casser la partie en cours.
        logger.exception("Game-start announcement failed for live match %s", match.id)


async def dispatch_game_abandoned(match) -> None:
    """Referme le fil d'une partie annoncée mais jamais terminée — sinon le
    « ça commence » reste orphelin pour toujours."""
    if not match.announced or not match.thread_key or match.closure_announced:
        return
    match.closure_announced = True
    try:
        async with async_session() as session:
            event = GameEvent(
                type="game_abandoned",
                data={"players": match.players, "thread_key": match.thread_key},
            )
            await dispatch_to_leagues(session, event, match.players, f"Live match {match.id} (abandon)")
    except Exception:
        logger.exception("Abandon announcement failed for live match %s", match.id)
