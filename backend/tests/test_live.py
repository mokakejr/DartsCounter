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


def _create(client, remote=False, players=("Leo", "Theo"), mode="FiftyOne", options=None):
    body = {"mode": mode, "players": list(players), "remote": remote}
    if options is not None:
        body["options"] = options
    resp = client.post("/live/matches", json=body)
    assert resp.status_code == 201
    return resp.json()


def test_create_and_list():
    with TestClient(app) as client:
        match = _create(client)
        assert match["started"] is True  # local match live immediately
        listed = client.get("/live/matches").json()
        assert [m["id"] for m in listed] == [match["id"]]


def test_options_roundtrip():
    """Les réglages du créateur (mode front, aléatoire partagé, vies…)
    reviennent intacts au rejoignant — le serveur ne les interprète pas."""
    options = {"mode": "killer", "numbers": [5, 17], "lives": 3, "isCasual": True}
    with TestClient(app) as client:
        match = _create(client, remote=True, mode="Killer", options=options)
        assert match["options"] == options
        assert client.get(f"/live/matches/{match['id']}").json()["options"] == options
        assert client.get("/live/matches").json()[0]["options"] == options
        # Sans options (ancien front) : None, pas de 422.
        legacy = _create(client, players=("Ana", "Bea"))
        assert legacy["options"] is None


def test_remote_flow_non_fifty_one():
    """Toute la tuyauterie remote est agnostique du mode : sas READY,
    snapshot STATE avec options, garde de tour, detail par mode."""
    options = {"mode": "killer", "numbers": [12, 3], "lives": 3, "isCasual": True}
    with TestClient(app) as client:
        match = _create(client, remote=True, mode="Killer", options=options)
        assert match["started"] is False
        client.post(f"/live/matches/{match['id']}/ready", json={"name": "Leo"})
        client.post(f"/live/matches/{match['id']}/ready", json={"name": "Theo"})
        with client.websocket_connect(f"/ws/live/{match['id']}?role=player&name=Theo") as theo, \
             client.websocket_connect(f"/ws/live/{match['id']}?role=spectator&name=Bob") as bob:
            state = theo.receive_json()
            assert state["event"] == "STATE"
            assert state["match"]["options"] == options  # le rejoignant reçoit tout
            assert state["match"]["started"] is True
            bob.receive_json()
            theo.receive_json()  # SPECTATORS

            # Garde de tour générique : c'est à Leo (players[0]), pas à Theo.
            theo.send_json({"event": "DART_THROWN", "dart_index": 0, "score_hit": {"multiplier": 1, "zone": 12}})
            theo.send_json({"event": "TURN_CHANGED", "player": "Theo"})
            assert bob.receive_json()["event"] == "TURN_CHANGED"
            theo.send_json({"event": "DART_THROWN", "dart_index": 0, "score_hit": {"multiplier": 1, "zone": 12}})
            assert bob.receive_json()["event"] == "DART_THROWN"

            # Le blob detail d'un mode non-51 est miroité tel quel.
            theo.send_json({
                "event": "SCORE_UPDATED",
                "scores": {"Leo": 2, "Theo": 3},
                "detail": {"kind": "killer", "currentPlayer": 0, "dartsThisTurn": 1},
            })
            assert bob.receive_json()["event"] == "SCORE_UPDATED"
        snap = client.get(f"/live/matches/{match['id']}").json()
        assert snap["detail"] == {"kind": "killer", "currentPlayer": 0, "dartsThisTurn": 1}
        assert snap["scores"] == {"Leo": 2, "Theo": 3}


def test_remote_match_waits_for_ready():
    with TestClient(app) as client:
        match = _create(client, remote=True)
        assert match["started"] is False
        with client.websocket_connect(f"/ws/live/{match['id']}?role=player&name=Theo") as theo:
            theo.receive_json()  # STATE
            client.post(f"/live/matches/{match['id']}/ready", json={"name": "Leo"})
            # L'adversaire voit le "Prêt" arriver en direct dans le sas.
            assert theo.receive_json() == {"event": "READY", "match_id": match["id"], "player_id": "Leo"}
            state = client.post(f"/live/matches/{match['id']}/ready", json={"name": "Theo"}).json()
            assert state["started"] is True
            assert state["connected"] == ["Theo"]  # identités déjà prises, pour le lobby


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


def test_chat_reaches_everyone_but_dnd_and_is_rate_limited():
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
            # Players see the chat too (product decision) — unless Focus mode.
            assert leo.receive_json()["event"] == "CHAT_MESSAGE"

            # Second message within 3s: rejected.
            bob.send_json({"event": "CHAT_MESSAGE", "message": "spam"})
            assert bob.receive_json()["event"] == "CHAT_REJECTED"

            # Cooldown passed + Leo in Focus mode: everyone but him gets it.
            leo.send_json({"event": "DND", "enabled": True})
            time.sleep(3.1)
            bob.send_json({"event": "CHAT_MESSAGE", "message": "silence radio ?"})
            assert carl.receive_json()["event"] == "CHAT_MESSAGE"
            # Leo (DND) skipped: his next frame is his own delta echo.
            leo.send_json({"event": "DART_THROWN", "dart_index": 0, "score_hit": {"multiplier": 1, "zone": 5}})
            assert leo.receive_json()["event"] == "DART_THROWN"

        # Vestiaire (14.3): transcript readable after the fact.
        chat = client.get(f"/live/matches/{match['id']}?include=chat").json()["chat"]
        assert len(chat) == 2


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


def test_stale_match_auto_closes_then_revives_on_play():
    import asyncio

    match = live.create_match("FiftyOne", ["Leo", "Theo"])
    match.last_activity = time.time() - 16 * 60
    assert asyncio.run(live.close_stale_matches()) == 1
    assert match.finished is True and match.aborted is True
    # Sortie du carousel, mais toujours consultable.
    assert live.list_matches() == []

    # Pause café terminée : une reprise du jeu ressuscite le match.
    live.apply_player_event(match, "Leo", {"event": "SCORE_UPDATED", "scores": {"Leo": 4}})
    assert match.finished is False and match.aborted is False
    assert [m.id for m in live.list_matches()] == [match.id]

    # Une VRAIE fin de partie reste définitive, même si un delta traîne.
    live.apply_player_event(match, "Leo", {"event": "MATCH_FINISHED", "winner": "Leo"})
    live.apply_player_event(match, "Leo", {"event": "SCORE_UPDATED", "scores": {"Leo": 9}})
    assert match.finished is True


def test_purge_expired():
    match = live.create_match("FiftyOne", ["Leo", "Theo"])
    match.last_activity = time.time() - 3 * 3600
    assert live.purge_expired() == 1
    assert live.get_match(match.id) is None


# --- Jauge de Hype (agrégat d'emotes + rate limit serveur) -------------------


def test_emote_rate_limited_per_sender():
    """Le throttle client (1 s) est contournable — le serveur tranche."""
    match = live.create_match("FiftyOne", ["Leo", "Theo"])
    assert live.check_emote(match, "Bob") is True
    assert live.check_emote(match, "Bob") is False  # back-to-back : rejeté
    assert live.check_emote(match, "Carl") is True  # par expéditeur, pas global


def test_crowd_hype_fires_at_threshold_then_cools_down():
    match = live.create_match("FiftyOne", ["Leo", "Theo"])
    for _ in range(live.HYPE_THRESHOLD - 1):
        assert live.register_emote(match) is False
    assert live.register_emote(match) is True  # seuil atteint : délire
    # La même vague ne re-déclenche pas (refroidissement 30 s).
    assert live.register_emote(match) is False


def test_crowd_hype_window_slides():
    """Les emotes plus vieilles que la fenêtre ne comptent plus."""
    match = live.create_match("FiftyOne", ["Leo", "Theo"])
    old = time.time() - live.HYPE_WINDOW_SECONDS - 1
    for _ in range(live.HYPE_THRESHOLD):
        match._emote_times.append(old)
    assert live.register_emote(match) is False  # tout est purgé sauf celle-ci
    assert len(match._emote_times) == 1


def test_crowd_hype_broadcast_over_ws(monkeypatch):
    """Deux spectateurs suffisent avec un seuil abaissé — un seul spammeur ne
    peut PAS déclencher le délire (rate limit par expéditeur)."""
    monkeypatch.setattr(live, "HYPE_THRESHOLD", 2)
    with TestClient(app) as client:
        match = _create(client)
        with client.websocket_connect(f"/ws/live/{match['id']}?role=spectator&name=Bob") as bob, \
             client.websocket_connect(f"/ws/live/{match['id']}?role=spectator&name=Carl") as carl:
            bob.receive_json(), carl.receive_json()  # STATE

            # Bob spamme : la 2e est droppée serveur, pas de CROWD_HYPE.
            bob.send_json({"event": "EMOTE", "emote": "👏"})
            bob.send_json({"event": "EMOTE", "emote": "👏"})
            assert bob.receive_json()["event"] == "EMOTE"
            assert carl.receive_json()["event"] == "EMOTE"

            # Carl s'y met : 2 expéditeurs distincts dans la fenêtre -> délire.
            carl.send_json({"event": "EMOTE", "emote": "🍺"})
            assert carl.receive_json()["event"] == "EMOTE"
            assert carl.receive_json()["event"] == "CROWD_HYPE"
            assert bob.receive_json()["event"] == "EMOTE"
            hype = bob.receive_json()
            assert hype["event"] == "CROWD_HYPE"
            assert hype["count"] >= 2


# --- Prono d'avant-match (Tale of the Tape) ---------------------------------


def test_prematch_vote_flow():
    with TestClient(app) as client:
        match = _create(client, remote=True)  # remote : pas encore démarré
        mid = match["id"]
        with client.websocket_connect(f"/ws/live/{mid}?role=spectator&name=Bob") as bob, \
             client.websocket_connect(f"/ws/live/{mid}?role=spectator&name=Carl") as carl:
            assert bob.receive_json()["event"] == "STATE"
            assert carl.receive_json()["event"] == "STATE"

            bob.send_json({"event": "VOTE", "player": "Leo"})
            assert bob.receive_json()["counts"] == {"Leo": 1}
            assert carl.receive_json()["counts"] == {"Leo": 1}

            # Re-voter change son camp (last-write-wins), ne double pas.
            bob.send_json({"event": "VOTE", "player": "Theo"})
            assert carl.receive_json()["counts"] == {"Theo": 1}
            bob.receive_json()

            # Joueur inconnu : silencieusement ignoré.
            carl.send_json({"event": "VOTE", "player": "Zorro"})
            carl.send_json({"event": "VOTE", "player": "Leo"})
            assert carl.receive_json()["counts"] == {"Theo": 1, "Leo": 1}
            bob.receive_json()

            # Retardataire : le STATE porte les agrégats (jamais qui a voté).
            with client.websocket_connect(f"/ws/live/{mid}?role=spectator&name=Dave") as dave:
                assert dave.receive_json()["match"]["votes"] == {"Theo": 1, "Leo": 1}

            # Première fléchette lancée : les paris sont clos.
            client.post(f"/live/matches/{mid}/ready", json={"name": "Leo"})
            client.post(f"/live/matches/{mid}/ready", json={"name": "Theo"})
            for _ in range(3):  # READY x2 + MATCH_STARTED
                bob.receive_json()
                carl.receive_json()
            bob.send_json({"event": "VOTE", "player": "Leo"})
            bob.send_json({"event": "EMOTE", "emote": "👏"})
            # Le VOTE tardif n'a rien émis : la frame suivante est l'EMOTE.
            assert bob.receive_json()["event"] == "EMOTE"
        assert client.get(f"/live/matches/{mid}").json()["votes"] == {"Theo": 1, "Leo": 1}
