"""Registre des fils de discussion Google Chat.

Une partie = un fil : la carte « ça commence » est le message racine, le
résultat arrive en réponse dessous. Le fil est identifié par une `threadKey`
que NOUS choisissons (cf. `messageReplyOption` dans targets/google_chat.py) —
rien à stocker côté Google.

Regroupement en rafale : une revanche lancée dans les 10 minutes suivant la
dernière activité des mêmes joueurs retombe dans le fil précédent. Une soirée
de 5 revanches fait 1 fil, pas 5.

# ponytail: état en mémoire, même modèle que live.MATCHES — uvicorn tourne en
# mono-worker (Dockerfile). Le perdre au redéploiement est sans conséquence :
# REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD retombe sur un nouveau fil.
"""

import time

# Fenêtre de regroupement : au-delà, une nouvelle partie ouvre son propre fil.
GROUP_WINDOW_SECONDS = 10 * 60
# Durée pendant laquelle on sait encore rattacher un résultat à son fil quand
# le match live a disparu. Plus large que la fenêtre de regroupement : une
# partie de 40 min doit poster son résultat dans le fil ouvert à son lancement.
LOOKUP_TTL_SECONDS = 2 * 3600

# roster (noms des joueurs, sans ordre) -> {"key": str, "last_activity": float}
_THREADS: dict[frozenset[str], dict] = {}


def _roster(players: list[str]) -> frozenset[str]:
    return frozenset(players)


def thread_key_for(players: list[str], seed: str) -> str:
    """Clé du fil à utiliser pour une partie qui démarre. Réutilise le fil des
    mêmes joueurs s'il est encore chaud, sinon en ouvre un nouveau à partir de
    `seed` (l'id du match live)."""
    roster = _roster(players)
    now = time.time()
    entry = _THREADS.get(roster)
    if entry is None or now - entry["last_activity"] > GROUP_WINDOW_SECONDS:
        entry = {"key": f"dc-{seed}", "last_activity": now}
        _THREADS[roster] = entry
    else:
        entry["last_activity"] = now
    return entry["key"]


def peek(players: list[str]) -> str | None:
    """Clé du fil de ces joueurs sans en créer un — sert de repli quand le
    match live a été purgé avant l'enregistrement de la partie."""
    entry = _THREADS.get(_roster(players))
    if entry is None or time.time() - entry["last_activity"] > LOOKUP_TTL_SECONDS:
        return None
    return entry["key"]


def touch(players: list[str]) -> None:
    """Relance la fenêtre de regroupement (appelé en fin de partie, pour que
    la revanche enchaînée reste dans le même fil)."""
    entry = _THREADS.get(_roster(players))
    if entry is not None:
        entry["last_activity"] = time.time()


def purge_expired() -> int:
    now = time.time()
    stale = [r for r, e in _THREADS.items() if now - e["last_activity"] > LOOKUP_TTL_SECONDS]
    for roster in stale:
        _THREADS.pop(roster, None)
    return len(stale)


def reset() -> None:
    """Vide le registre — utilisé par les tests, l'état étant global."""
    _THREADS.clear()
