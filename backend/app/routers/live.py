"""Live matches: REST for the carousel/lobby + the WebSocket room itself.

No auth: the counter app is anonymous by design (players are picked by
name); leagues are an office trust circle. Spectator/player segregation is
role-based per connection (Epic 11.1 / 14.1).
"""

import asyncio
import logging
import time

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.services import live

logger = logging.getLogger(__name__)

router = APIRouter(tags=["live"])


class LiveMatchCreate(BaseModel):
    mode: str = Field(min_length=1, max_length=40)
    players: list[str] = Field(min_length=1, max_length=8)
    variant: str | None = None
    remote: bool = False


class ReadyPayload(BaseModel):
    name: str


@router.post("/live/matches", status_code=201)
async def create_live_match(payload: LiveMatchCreate) -> dict:
    match = live.create_match(payload.mode, payload.players, payload.remote, payload.variant)
    return live.to_dict(match)


@router.get("/live/matches")
async def list_live_matches() -> list[dict]:
    # ponytail: no league filter server-side — 0-3 concurrent matches at
    # office scale, the dashboard intersects with its active league's players.
    return [live.to_dict(m) for m in live.list_matches()]


@router.get("/live/matches/{match_id}")
async def get_live_match(match_id: str, include: str | None = Query(default=None)) -> dict:
    match = live.get_match(match_id)
    if match is None:
        raise HTTPException(404, "Live match not found (expired?)")
    return live.to_dict(match, include_chat=include == "chat")


@router.post("/live/matches/{match_id}/ready")
async def ready_live_match(match_id: str, payload: ReadyPayload) -> dict:
    match = live.get_match(match_id)
    if match is None:
        raise HTTPException(404, "Live match not found (expired?)")
    just_started = live.mark_ready(match, payload.name)
    # The opponent's lobby updates live ("✓ Prêt") — REST and WS READY paths
    # must both broadcast.
    await live.broadcast(match, {"event": "READY", "match_id": match.id, "player_id": payload.name})
    if just_started:
        await live.broadcast(match, {"event": "MATCH_STARTED", "match_id": match.id})
    return live.to_dict(match)


@router.websocket("/ws/live/{match_id}")
async def live_room(
    websocket: WebSocket,
    match_id: str,
    role: str = Query(default=live.ROLE_SPECTATOR),
    name: str = Query(default="anonyme"),
) -> None:
    match = live.get_match(match_id)
    if match is None:
        await websocket.close(code=4404)
        return
    if role not in (live.ROLE_PLAYER, live.ROLE_SPECTATOR):
        role = live.ROLE_SPECTATOR
    # Only listed players get the PLAYER role — everyone else watches.
    if role == live.ROLE_PLAYER and name not in match.players:
        role = live.ROLE_SPECTATOR

    await websocket.accept()
    if role == live.ROLE_PLAYER:
        match.player_sockets[name] = websocket
    else:
        match.spectator_sockets.add(websocket)
        # Players only ("3 personnes aux gradins") — keeps the joining
        # spectator's frame order deterministic: STATE first.
        await live.broadcast(
            match,
            {"event": "SPECTATORS", "match_id": match.id, "count": len(match.spectator_sockets)},
            to_spectators=False,
            respect_dnd=True,
        )

    # Snapshot so late joiners render immediately.
    await websocket.send_json({"event": "STATE", "match": live.to_dict(match, include_chat=role == live.ROLE_SPECTATOR)})

    try:
        while True:
            data = await websocket.receive_json()
            etype = data.get("event")

            if role == live.ROLE_PLAYER and etype in live.PLAYER_EVENTS:
                accepted = live.apply_player_event(match, name, data)
                if not accepted and etype == "DART_THROWN":
                    continue  # remote match: not this player's turn
                # Local matches share one socket: the event may name the
                # actual thrower; fall back to the connection's identity.
                payload = {**data, "match_id": match.id, "player_id": data.get("player") or name}
                if etype == "READY" and accepted:
                    await live.broadcast(match, {"event": "MATCH_STARTED", "match_id": match.id})
                elif etype == "DND":
                    pass  # private toggle, nothing to broadcast
                else:
                    # Game deltas go to everyone (players need the handover,
                    # spectators the show).
                    await live.broadcast(match, payload)

            elif role == live.ROLE_SPECTATOR and etype in live.SPECTATOR_EVENTS:
                if etype == "CHAT_MESSAGE":
                    message = live.check_chat(match, name, str(data.get("message", "")))
                    if message is None:
                        await websocket.send_json({"event": "CHAT_REJECTED", "reason": "rate_limit"})
                        continue
                    entry = {"sender_id": name, "message": message, "timestamp": int(time.time())}
                    match.chat.append(entry)
                    # Décision produit (recette Théo) : le chat s'affiche aussi
                    # chez les joueurs — en overlay fugace — sauf Mode Focus.
                    await live.broadcast(
                        match,
                        {"event": "CHAT_MESSAGE", "match_id": match.id, **entry},
                        respect_dnd=True,
                    )
                elif etype == "EMOTE":
                    emote = str(data.get("emote", ""))[:8]
                    # Players in Focus mode (DND) are skipped (12.2).
                    await live.broadcast(
                        match,
                        {"event": "EMOTE", "match_id": match.id, "sender_id": name, "emote": emote},
                        respect_dnd=True,
                    )
            # Anything else: silently dropped (role segregation, 11.1).
    except WebSocketDisconnect:
        pass
    finally:
        if role == live.ROLE_PLAYER:
            match.player_sockets.pop(name, None)
            if match.remote and not match.finished:
                await live.broadcast(match, {"event": "PLAYER_LEFT", "match_id": match.id, "player_id": name})
            # Partie quittée sans fin de match : plus aucun joueur connecté
            # pendant 60 s (grâce pour les coupures réseau) -> on clôt, le
            # LiveCarousel ne doit pas afficher un match fantôme 2 h.
            if not match.finished and not match.player_sockets:
                asyncio.create_task(_finish_if_abandoned(match))
        else:
            match.spectator_sockets.discard(websocket)


async def _finish_if_abandoned(match, grace_seconds: int = 60) -> None:
    await asyncio.sleep(grace_seconds)
    if not match.finished and not match.player_sockets:
        match.finished = True
        match.touch()
        await live.broadcast(match, {"event": "MATCH_FINISHED", "match_id": match.id, "aborted": True})
