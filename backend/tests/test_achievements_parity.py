"""Parité du catalogue de trophées JS ↔ Python.

`shared/achievements-core.mjs` (le moteur du dashboard) et
`app/services/achievements.py` (le port serveur) doivent définir le MÊME
ensemble de trophées. Il n'existait aucun test de parité, et les deux avaient
silencieusement divergé : 12 trophées « détenteur unique » manquaient côté
Python.

Ce test lit le catalogue JS en direct (via node) plutôt qu'une copie figée —
c'est justement la dérive qu'il doit attraper. Écrit AVANT le correctif (D2) :
il est donc marqué xfail avec la liste explicite des 12 manques. D2 ajoute les
trophées et lève le xfail.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from app.services.achievements import ACHIEVEMENTS, compute_player_stats

_MJS = Path(__file__).resolve().parents[2] / "shared" / "achievements-core.mjs"
_TROPHIES = Path(__file__).resolve().parents[2] / "pwa-dashboard" / "src" / "lib" / "trophies.js"


def _node() -> str:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node absent — parité JS↔Python non vérifiable ici")
    return node


def _run_node(script: str) -> str:
    # TZ=UTC épingle le fuseau : computePlayerStats côté JS lit getHours()/
    # getDate()/getDay() en heure LOCALE, et les fixtures ci-dessous sont en
    # UTC (suffixe Z). Sans ce pin, le bucketing par jour divergerait selon le
    # fuseau du runner. Côté Python, fromisoformat garde l'offset UTC.
    return subprocess.run(
        [_node(), "--input-type=module", "-e", script],
        capture_output=True, text=True, check=True,
        env={**os.environ, "TZ": "UTC"},
    ).stdout


def _js_achievement_ids() -> set[str]:
    script = (
        f"import({json.dumps(_MJS.as_uri())})"
        ".then(m => console.log(JSON.stringify(m.ACHIEVEMENTS.map(a => a.id))))"
    )
    return set(json.loads(_run_node(script)))


# Fixture partagée : parties variées (plusieurs modes, Cut Throat à gros score,
# victoires éclair, séries, plusieurs jours) pour exercer prog/value sur des
# valeurs non triviales. Dates en UTC (Z) — cf. _run_node.
_GAMES = [
    {"id": "g1",  "date": "2026-08-01T18:00:00Z", "mode": "Cricket",      "variant": "Normal",       "players": ["Alice", "Bob"],           "scores": [40, 25],        "winner": "Alice", "duration": 300},
    {"id": "g2",  "date": "2026-08-01T19:00:00Z", "mode": "Cricket",      "variant": "Normal",       "players": ["Alice", "Bob"],           "scores": [55, 30],        "winner": "Alice", "duration": 90},
    {"id": "g3",  "date": "2026-08-01T20:00:00Z", "mode": "Cricket",      "variant": "Cut Throat",   "players": ["Alice", "Bob", "Carol"],  "scores": [1200, 300, 200],"winner": "Carol", "duration": 400},
    {"id": "g4",  "date": "2026-08-02T18:00:00Z", "mode": "Shanghai",     "variant": "Shanghai Kill","players": ["Bob", "Carol"],           "scores": [180, 120],      "winner": "Bob",   "duration": 200},
    {"id": "g5",  "date": "2026-08-02T19:00:00Z", "mode": "Shanghai",     "variant": "Normal",       "players": ["Bob", "Carol"],           "scores": [150, 140],      "winner": "Bob",   "duration": 250},
    {"id": "g6",  "date": "2026-08-02T20:00:00Z", "mode": "SuperCricket", "variant": "Normal",       "players": ["Carol", "Alice"],         "scores": [70, 60],        "winner": "Carol", "duration": 500},
    {"id": "g7",  "date": "2026-08-03T18:00:00Z", "mode": "FiftyOne",     "variant": "Normal",       "players": ["Alice", "Carol"],         "scores": [51, 40],        "winner": "Alice", "duration": 120},
    {"id": "g8",  "date": "2026-08-03T19:00:00Z", "mode": "Cricket",      "variant": "Normal",       "players": ["Alice", "Bob"],           "scores": [45, 20],        "winner": "Alice", "duration": 110},
    {"id": "g9",  "date": "2026-08-03T20:00:00Z", "mode": "Shanghai",     "variant": "Shanghai Kill","players": ["Bob", "Carol"],           "scores": [175, 90],       "winner": "Bob",   "duration": 80},
    {"id": "g10", "date": "2026-08-04T18:00:00Z", "mode": "SuperCricket", "variant": "Normal",       "players": ["Carol", "Bob"],           "scores": [65, 55],        "winner": "Carol", "duration": 600},
    {"id": "g11", "date": "2026-08-04T19:00:00Z", "mode": "FiftyOne",     "variant": "Normal",       "players": ["Alice", "Bob"],           "scores": [51, 30],        "winner": "Alice", "duration": 700},
    {"id": "g12", "date": "2026-08-04T20:00:00Z", "mode": "Cricket",      "variant": "Normal",       "players": ["Bob", "Alice"],           "scores": [35, 50],        "winner": "Alice", "duration": 200},
]


def _js_prog_value() -> dict:
    # Rejoue la fixture côté JS et sort, par trophée puis par joueur (trié),
    # {cond, prog, value}. value n'est calculée que si cond est vraie — comme
    # le mur : pour un non-détenteur, JS renverrait "undefined" (ex. record de
    # score sans partie dans ce mode), qui n'a pas à correspondre à Python.
    script = f"""
import({json.dumps(_MJS.as_uri())}).then(m => {{
  const games = {json.dumps(_GAMES)};
  const stats = m.computePlayerStats(games);
  const players = Object.values(stats).sort((a, b) => a.name < b.name ? -1 : 1);
  const out = {{}};
  for (const a of m.ACHIEVEMENTS) {{
    out[a.id] = players.map(s => {{
      const cond = !!a.cond(s, stats);
      return {{
        name: s.name,
        cond,
        prog: a.prog ? a.prog(s) : null,
        value: cond && a.value ? a.value(s, stats) : null,
      }};
    }});
  }}
  console.log(JSON.stringify(out));
}});
"""
    return json.loads(_run_node(script))


def _py_prog_value() -> dict:
    stats = compute_player_stats(_GAMES)
    players = sorted(stats.values(), key=lambda s: s["name"])
    out: dict = {}
    for a in ACHIEVEMENTS:
        rows = []
        for s in players:
            cond = bool(a["cond"](s, stats))
            rows.append({
                "name": s["name"],
                "cond": cond,
                "prog": a["prog"](s) if "prog" in a else None,
                "value": a["value"](s) if (cond and "value" in a) else None,
            })
        out[a["id"]] = rows
    # Passe par JSON pour aligner les types (tuples/ints) sur la sortie node.
    return json.loads(json.dumps(out))


def _py_achievement_ids() -> set[str]:
    return {a["id"] for a in ACHIEVEMENTS}


def test_no_python_only_achievements():
    """Aucun trophée ne doit exister côté Python sans exister côté JS : le front
    afficherait un trophée que le backend ne sait pas nommer."""
    extra = _py_achievement_ids() - _js_achievement_ids()
    assert extra == set(), f"Trophées Python sans équivalent JS : {sorted(extra)}"


def test_catalogs_are_identical():
    """La cible, atteinte en D2 : ensembles d'ids strictement égaux dans les
    deux sens. Le xfail d'origine a été levé une fois les 12 trophées ajoutés."""
    js, py = _js_achievement_ids(), _py_achievement_ids()
    assert js == py, (
        f"Divergence de catalogue.\n"
        f"JS seulement : {sorted(js - py)}\n"
        f"Python seulement : {sorted(py - js)}"
    )


def _js_prog_value_definitions() -> dict[str, list[str]]:
    """Quels trophées définissent prog / value côté JS (indépendamment de la
    fixture) — attrape une dérive structurelle même sur un trophée que personne
    ne débloque dans _GAMES."""
    script = (
        f"import({json.dumps(_MJS.as_uri())}).then(m => console.log(JSON.stringify({{"
        "prog: m.ACHIEVEMENTS.filter(a => a.prog).map(a => a.id),"
        "value: m.ACHIEVEMENTS.filter(a => a.value).map(a => a.id)"
        "})))"
    )
    return json.loads(_run_node(script))


def test_prog_value_definitions_match_js():
    """Le MÊME ensemble de trophées porte prog / value dans les deux ports."""
    js = _js_prog_value_definitions()
    py_prog = {a["id"] for a in ACHIEVEMENTS if "prog" in a}
    py_value = {a["id"] for a in ACHIEVEMENTS if "value" in a}
    assert py_prog == set(js["prog"]), (
        f"prog : JS seulement {sorted(set(js['prog']) - py_prog)} · "
        f"Python seulement {sorted(py_prog - set(js['prog']))}"
    )
    assert py_value == set(js["value"]), (
        f"value : JS seulement {sorted(set(js['value']) - py_value)} · "
        f"Python seulement {sorted(py_value - set(js['value']))}"
    )


def test_prog_value_parity():
    """Cœur de D3 : sur la même fixture rejouée dans les deux moteurs, cond +
    prog + value coïncident trophée par trophée, joueur par joueur. C'est ici
    qu'une divergence numérique (seuil, off-by-one, formule) se révèle."""
    js, py = _js_prog_value(), _py_prog_value()
    assert set(js) == set(py), "ids divergents entre les deux sorties"
    diffs = [tid for tid in js if js[tid] != py[tid]]
    assert not diffs, (
        "Divergence prog/value sur : " + ", ".join(sorted(diffs)) + "\n"
        + "\n".join(
            f"  {tid}:\n    JS = {js[tid]}\n    PY = {py[tid]}" for tid in sorted(diffs)
        )
    )


# ── D4 : parité du mur complet (build_trophies ↔ buildTrophies) ──────────────
def _js_build_trophies(player: str | None) -> list[dict]:
    """buildTrophies du dashboard (pwa-dashboard/src/lib/trophies.js) rejoué sur
    la fixture. JSON.stringify laisse tomber les fonctions de `...a`, ne restent
    que les champs de données. `myValue` (camelCase) est renommé pour coller au
    contrat snake_case de l'endpoint."""
    player_js = "null" if player is None else json.dumps(player)
    script = f"""
Promise.all([
  import({json.dumps(_TROPHIES.as_uri())}),
  import({json.dumps(_MJS.as_uri())}),
]).then(([T, M]) => {{
  const stats = M.computePlayerStats({json.dumps(_GAMES)});
  console.log(JSON.stringify(T.buildTrophies(stats, {player_js})));
}});
"""
    out = json.loads(_run_node(script))
    for t in out:
        t["my_value"] = t.pop("myValue")
    return out


def _py_build_trophies(player: str | None) -> list[dict]:
    from app.services.achievements import build_trophies

    stats = compute_player_stats(_GAMES)
    return json.loads(json.dumps(build_trophies(stats, player_name=player)))


@pytest.mark.parametrize("player", [None, "Alice", "Bob"])
def test_build_trophies_parity(player):
    """Vérif D4 : la sortie de l'endpoint (build_trophies) coïncide avec le
    buildTrophies client — détenteurs, unlocked, rareté, progression, my_value —
    en vue globale ET en vue joueur. C'est la condition pour que le front cesse
    de calculer le mur."""
    js, py = _js_build_trophies(player), _py_build_trophies(player)
    assert len(js) == len(py)
    by_id_js = {t["id"]: t for t in js}
    by_id_py = {t["id"]: t for t in py}
    assert set(by_id_js) == set(by_id_py)
    diffs = [tid for tid in by_id_js if by_id_js[tid] != by_id_py[tid]]
    assert not diffs, (
        f"Divergence mur (player={player}) sur : " + ", ".join(sorted(diffs)) + "\n"
        + "\n".join(
            f"  {tid}:\n    JS = {by_id_js[tid]}\n    PY = {by_id_py[tid]}"
            for tid in sorted(diffs)
        )
    )
