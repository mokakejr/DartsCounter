"""Live rooms: role segregation, deltas, chat rate limit (Epics 11/12/14).

The WS tests use starlette's sync TestClient (its own event loop) — no
Postgres needed, the live registry is pure memory.
"""

import time

import pytest
from starlette.testclient import TestClient

from app.main import app
from app.services import live


@pytest.fixture(autouse=True)
def _clean_registry():
    live.MATCHES.clear()
    yield
    live.MATCHES.clear()


def _create(client, remote=False, players=("Leo", "Theo")):
    resp = client.post(
        "/live/matches",
        json={"mode": "FiftyOne", "players": list(players), "remote": remote},
    )
    assert resp.status_code == 201
    return resp.json()


def test_create_and_list():
    with TestClient(app) as client:
        match = _create(client)
        assert match["started"] is True  # local match live immediately
        listed = client.get("/live/matches").json()
        assert [m["id"] for m in listed] == [match["id"]]


def test_remote_match_waits_for_ready():
    with TestClient(app) as client:
        match = _create(client, remote=True)
        assert match["started"] is False
        client.post(f"/live/matches/{match['id']}/ready", json={"name": "Leo"})
        state = client.post(f"/live/matches/{match['id']}/ready", json={"name": "Theo"}).json()
        assert state["started"] is True


def test_deltas_reach_spectator_and_update_state():
    with TestClient(app) as client:
        match = _create(client)
        with client.websocket_connect(f"/ws/live/{match['id']}?role=player&name=Leo") as leo, \
             client.websocket_connect(f"/ws/live/{match['id']}?role=spectator&name=Bob") as bob:
            assert leo.receive_json()["event"] == "STATE"
            assert bob.receive_json()["event"] == "STATE"
            leo.receive_json()  # SPECTATORS count after Bob joined

            leo.send_json({"event": "DART_THROWN", "dart_index": 2, "score_hit": {"multiplier": 3, "zone": 20}})
            seen = bob.receive_json()
            assert seen["event"] == "DART_THROWN"
            assert seen["player_id"] == "Leo"
            assert seen["score_hit"] == {"multiplier": 3, "zone": 20}

            leo.send_json({"event": "SCORE_UPDATED", "scores": {"Leo": 12}, "round": 4})
            bob.receive_json()

        state = client.get(f"/live/matches/{match['id']}").json()
        assert state["scores"]["Leo"] == 12
        assert state["round"] == 4


def test_chat_goes_to_spectators_only_and_is_rate_limited():
    with TestClient(app) as client:
        match = _create(client)
        with client.websocket_connect(f"/ws/live/{match['id']}?role=player&name=Leo") as leo, \
             client.websocket_connect(f"/ws/live/{match['id']}?role=spectator&name=Bob") as bob, \
             client.websocket_connect(f"/ws/live/{match['id']}?role=spectator&name=Carl") as carl:
            for ws in (leo, bob, carl):
                ws.receive_json()  # STATE
            leo.receive_json(), leo.receive_json()  # SPECTATORS x2 (players only)

            bob.send_json({"event": "CHAT_MESSAGE", "message": "Encore un 26 ! " + "x" * 100})
            msg = carl.receive_json()
            assert msg["event"] == "CHAT_MESSAGE"
            assert len(msg["message"]) <= 60  # length cap (14.4)
            assert bob.receive_json()["event"] == "CHAT_MESSAGE"  # own echo

            # Second message within 3s: rejected.
            bob.send_json({"event": "CHAT_MESSAGE", "message": "spam"})
            assert bob.receive_json()["event"] == "CHAT_REJECTED"

            # A player never receives the chat stream (14.1): Leo's next
            # frame is his own delta echo, not the chat.
            leo.send_json({"event": "DART_THROWN", "dart_index": 0, "score_hit": {"multiplier": 1, "zone": 5}})
            assert leo.receive_json()["event"] == "DART_THROWN"

        # Vestiaire (14.3): transcript readable after the fact.
        chat = client.get(f"/live/matches/{match['id']}?include=chat").json()["chat"]
        assert len(chat) == 1


def test_spectator_cannot_emit_game_events():
    with TestClient(app) as client:
        match = _create(client)
        with client.websocket_connect(f"/ws/live/{match['id']}?role=spectator&name=Bob") as bob:
            bob.receive_json()  # STATE
            bob.send_json({"event": "SCORE_UPDATED", "scores": {"Leo": 999}})
            bob.send_json({"event": "EMOTE", "emote": "🍅"})
            assert bob.receive_json()["event"] == "EMOTE"  # emote passed, score dropped
        assert client.get(f"/live/matches/{match['id']}").json()["scores"]["Leo"] == 0


def test_dnd_blocks_emotes_for_that_player():
    with TestClient(app) as client:
        match = _create(client)
        with client.websocket_connect(f"/ws/live/{match['id']}?role=player&name=Leo") as leo, \
             client.websocket_connect(f"/ws/live/{match['id']}?role=spectator&name=Bob") as bob:
            leo.receive_json()
            bob.receive_json()
            leo.receive_json()  # SPECTATORS

            leo.send_json({"event": "DND", "enabled": True})
            bob.send_json({"event": "EMOTE", "emote": "🍅"})
            assert bob.receive_json()["event"] == "EMOTE"  # spectator still sees it

            # Leo (focus mode) must NOT have received the tomato: send a
            # delta and check his next frame is that delta echo.
            leo.send_json({"event": "DART_THROWN", "dart_index": 0, "score_hit": {"multiplier": 1, "zone": 1}})
            assert leo.receive_json()["event"] == "DART_THROWN"


def test_remote_turn_guard():
    with TestClient(app) as client:
        match = _create(client, remote=True)
        client.post(f"/live/matches/{match['id']}/ready", json={"name": "Leo"})
        client.post(f"/live/matches/{match['id']}/ready", json={"name": "Theo"})
        with client.websocket_connect(f"/ws/live/{match['id']}?role=player&name=Theo") as theo, \
             client.websocket_connect(f"/ws/live/{match['id']}?role=spectator&name=Bob") as bob:
            theo.receive_json()
            bob.receive_json()
            theo.receive_json()  # SPECTATORS

            # Turn player is Leo (players[0]) — Theo's dart is dropped.
            theo.send_json({"event": "DART_THROWN", "dart_index": 0, "score_hit": {"multiplier": 1, "zone": 20}})
            # Handover then throws fine.
            theo.send_json({"event": "TURN_CHANGED", "player": "Theo", "round": 2})
            assert bob.receive_json()["event"] == "TURN_CHANGED"
            theo.send_json({"event": "DART_THROWN", "dart_index": 0, "score_hit": {"multiplier": 1, "zone": 20}})
            assert bob.receive_json()["event"] == "DART_THROWN"


def test_purge_expired():
    match = live.create_match("FiftyOne", ["Leo", "Theo"])
    match.last_activity = time.time() - 3 * 3600
    assert live.purge_expired() == 1
    assert live.get_match(match.id) is None
