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
import shutil
import subprocess
from pathlib import Path

import pytest

from app.services.achievements import ACHIEVEMENTS

_MJS = Path(__file__).resolve().parents[2] / "shared" / "achievements-core.mjs"


def _js_achievement_ids() -> set[str]:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node absent — parité JS↔Python non vérifiable ici")
    script = (
        f"import({json.dumps(_MJS.as_uri())})"
        ".then(m => console.log(JSON.stringify(m.ACHIEVEMENTS.map(a => a.id))))"
    )
    out = subprocess.run(
        [node, "--input-type=module", "-e", script],
        capture_output=True, text=True, check=True,
    )
    return set(json.loads(out.stdout))


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
