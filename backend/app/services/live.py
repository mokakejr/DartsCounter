"""Live match registry + WebSocket rooms (Epics 11 / 12 / 14).

Matches here are EPHEMERAL: they exist only while people play/watch, the
durable record stays `POST /games` at the end. Everything lives in process
memory.
# ponytail: in-memory rooms — uvicorn runs a single worker (Dockerfile);
# move to Redis pub/sub only if we ever scale out.
"""

import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

ROLE_PLAYER = "player"
ROLE_SPECTATOR = "spectator"

# Events players may emit / spectators may emit.
PLAYER_EVENTS = {"DART_THROWN", "TURN_CHANGED", "SCORE_UPDATED", "MATCH_FINISHED", "DND", "READY"}
SPECTATOR_EVENTS = {"CHAT_MESSAGE", "EMOTE"}

CHAT_MAX_LEN = 60
CHAT_COOLDOWN_SECONDS = 3.0
MATCH_TTL_SECONDS = 2 * 3600  # idle matches (suppression définitive)
STALE_AFTER_SECONDS = 15 * 60  # sans activité de JEU -> clôturé (réversible)
FINISHED_TTL_SECONDS = 3600  # keep the chat readable for the Vestiaire (14.3)


@dataclass
class LiveMatch:
    id: str
    mode: str
    players: list[str]
    remote: bool = False
    variant: str | None = None
    # Réglages de partie opaques (id de mode front, cibles Shanghai, numéros
    # Killer, vies, isCasual…) — posés à la création, relayés tels quels au
    # rejoignant via GET /live/matches/{id} et le snapshot STATE. Le serveur
    # ne les interprète jamais (même modèle que `detail`).
    options: dict | None = None
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    started: bool = False
    finished: bool = False
    # Clôture automatique (inactivité/abandon) — réversible : une reprise du
    # jeu ressuscite le match, contrairement à une vraie fin de partie.
    aborted: bool = False
    # Display state, fed by SCORE_UPDATED deltas — the server doesn't replay
    # game rules, clients are the source of truth (office trust model).
    scores: dict[str, int] = field(default_factory=dict)
    # Blob opaque par mode (ex: tableau des marques Cricket) — relayé tel
    # quel aux spectateurs, inclus dans le snapshot STATE des retardataires.
    detail: dict | None = None
    round: int = 1
    turn_player: str | None = None
    dart_index: int = 0
    ready: set[str] = field(default_factory=set)
    dnd: set[str] = field(default_factory=set)
    chat: deque = field(default_factory=lambda: deque(maxlen=200))
    _last_chat: dict[str, float] = field(default_factory=dict)
    # name -> socket for players; set of sockets for spectators
    player_sockets: dict[str, WebSocket] = field(default_factory=dict)
    spectator_sockets: set = field(default_factory=set)

    def touch(self) -> None:
        self.last_activity = time.time()


MATCHES: dict[str, LiveMatch] = {}


def create_match(
    mode: str,
    players: list[str],
    remote: bool = False,
    variant: str | None = None,
    options: dict | None = None,
) -> LiveMatch:
    match = LiveMatch(
        id=uuid.uuid4().hex[:12],
        mode=mode,
        variant=variant,
        options=options,
        players=players,
        remote=remote,
        started=not remote,  # local matches are live immediately; remote waits on READY
        scores={p: 0 for p in players},
        turn_player=players[0] if players else None,
    )
    MATCHES[match.id] = match
    return match


def get_match(match_id: str) -> LiveMatch | None:
    return MATCHES.get(match_id)


def list_matches() -> list[LiveMatch]:
    return [m for m in MATCHES.values() if not m.finished]


async def close_stale_matches() -> int:
    """Une partie qui ne bouge plus depuis 15 min est clôturée (elle sort
    du LiveCarousel, rien n'est enregistré — seul POST /games compte une
    partie). Le chat/emotes des spectateurs ne maintiennent PAS en vie :
    seule l'activité de jeu touche last_activity."""
    closed = 0
    now = time.time()
    for match in list(MATCHES.values()):
        if not match.finished and now - match.last_activity > STALE_AFTER_SECONDS:
            match.finished = True
            match.aborted = True
            await broadcast(
                match,
                {"event": "MATCH_FINISHED", "match_id": match.id, "aborted": True, "reason": "inactivity"},
            )
            closed += 1
    return closed


def purge_expired() -> int:
    now = time.time()
    stale = [
        mid
        for mid, m in MATCHES.items()
        if (m.finished and now - m.last_activity > FINISHED_TTL_SECONDS)
        or now - m.last_activity > MATCH_TTL_SECONDS
    ]
    for mid in stale:
        MATCHES.pop(mid, None)
    return len(stale)


def to_dict(match: LiveMatch, include_chat: bool = False) -> dict[str, Any]:
    data = {
        "id": match.id,
        "mode": match.mode,
        "variant": match.variant,
        "options": match.options,
        "players": match.players,
        "remote": match.remote,
        "started": match.started,
        "finished": match.finished,
        "scores": match.scores,
        "round": match.round,
        "turn_player": match.turn_player,
        "dart_index": match.dart_index,
        "detail": match.detail,
        "ready": sorted(match.ready),
        "connected": sorted(match.player_sockets),
        "spectators": len(match.spectator_sockets),
        "created_at": match.created_at,
    }
    if include_chat:
        data["chat"] = list(match.chat)
    return data


def mark_ready(match: LiveMatch, name: str) -> bool:
    """Returns True when everyone is ready and the match just started."""
    if name in match.players:
        match.ready.add(name)
        match.touch()
    if not match.started and set(match.players) <= match.ready:
        match.started = True
        return True
    return False


def check_chat(match: LiveMatch, sender: str, message: str) -> str | None:
    """Rate limit (1 msg / 3 s / sender) + length cap (14.4). Returns the
    sanitized message, or None if rejected."""
    now = time.time()
    if now - match._last_chat.get(sender, 0) < CHAT_COOLDOWN_SECONDS:
        return None
    message = message.strip()[:CHAT_MAX_LEN]
    if not message:
        return None
    match._last_chat[sender] = now
    return message


def apply_player_event(match: LiveMatch, sender: str, event: dict) -> bool:
    """Updates the display state from a player delta. Returns False if the
    event should be dropped (e.g. remote match, not this player's turn)."""
    etype = event.get("event")
    match.touch()
    # Pause café > 15 min : le match auto-clôturé revit dès qu'on rejoue.
    # (Une VRAIE fin de partie — aborted=False — reste définitive.)
    if match.finished and match.aborted and etype in ("DART_THROWN", "SCORE_UPDATED", "TURN_CHANGED"):
        match.finished = False
        match.aborted = False
    if etype == "DART_THROWN":
        # Light guard: in remote matches only the turn player throws.
        if match.remote and match.started and sender != match.turn_player:
            return False
        # Local matches: one shared phone, one socket — the event names the
        # actual thrower; remote: the sender IS the thrower.
        match.turn_player = event.get("player") or sender
        match.dart_index = int(event.get("dart_index", match.dart_index))
    elif etype == "TURN_CHANGED":
        match.turn_player = event.get("player") or match.turn_player
        match.dart_index = 0
        match.round = int(event.get("round", match.round))
    elif etype == "SCORE_UPDATED":
        scores = event.get("scores") or {}
        match.scores.update({str(k): int(v) for k, v in scores.items()})
        if "round" in event:
            match.round = int(event["round"])
        if "detail" in event:
            match.detail = event["detail"]
    elif etype == "MATCH_FINISHED":
        match.finished = True
        match.aborted = bool(event.get("aborted"))
        match.turn_player = None
    elif etype == "DND":
        if event.get("enabled"):
            match.dnd.add(sender)
        else:
            match.dnd.discard(sender)
    elif etype == "READY":
        return mark_ready(match, sender)
    return True


# --- broadcasting -----------------------------------------------------------


async def _send(socket: WebSocket, payload: dict) -> None:
    try:
        await socket.send_json(payload)
    except Exception:
        pass  # dead socket — cleaned up on its own disconnect


async def broadcast(
    match: LiveMatch,
    payload: dict,
    to_players: bool = True,
    to_spectators: bool = True,
    respect_dnd: bool = False,
) -> None:
    if to_players:
        for name, socket in list(match.player_sockets.items()):
            if respect_dnd and name in match.dnd:
                continue
            await _send(socket, payload)
    if to_spectators:
        for socket in list(match.spectator_sockets):
            await _send(socket, payload)
