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
MATCH_TTL_SECONDS = 2 * 3600  # idle matches
FINISHED_TTL_SECONDS = 3600  # keep the chat readable for the Vestiaire (14.3)


@dataclass
class LiveMatch:
    id: str
    mode: str
    players: list[str]
    remote: bool = False
    variant: str | None = None
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    started: bool = False
    finished: bool = False
    # Display state, fed by SCORE_UPDATED deltas — the server doesn't replay
    # game rules, clients are the source of truth (office trust model).
    scores: dict[str, int] = field(default_factory=dict)
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
    mode: str, players: list[str], remote: bool = False, variant: str | None = None
) -> LiveMatch:
    match = LiveMatch(
        id=uuid.uuid4().hex[:12],
        mode=mode,
        variant=variant,
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
        "players": match.players,
        "remote": match.remote,
        "started": match.started,
        "finished": match.finished,
        "scores": match.scores,
        "round": match.round,
        "turn_player": match.turn_player,
        "dart_index": match.dart_index,
        "ready": sorted(match.ready),
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
    if etype == "DART_THROWN":
        # Light guard: in remote matches only the turn player throws.
        if match.remote and match.started and sender != match.turn_player:
            return False
        match.turn_player = sender
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
    elif etype == "MATCH_FINISHED":
        match.finished = True
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
