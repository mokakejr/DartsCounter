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

# Les 12 trophées « détenteur unique » absents du port Python au moment où ce
# test est écrit. D2 les ajoute et retire ce bloc + le xfail ci-dessous.
KNOWN_GAPS = {
    "cricket_champ", "sc_champ", "shanghai_champ", "fiftyone_champ",
    "cricket_top_score", "sc_top_score", "shanghai_top_score", "fiftyone_top_score",
    "cricket_low_score", "sc_low_score", "shanghai_low_score", "fiftyone_low_score",
}


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


def test_known_gaps_are_exactly_those_expected():
    """Verrou de régression sur la liste des manques elle-même : si un trophée
    disparaît ou apparaît côté Python en dehors de D2, le diff change et ce
    test le signale."""
    missing = _js_achievement_ids() - _py_achievement_ids()
    assert missing == KNOWN_GAPS, (
        f"Le diff JS→Python a changé.\n"
        f"Attendu (manques connus) : {sorted(KNOWN_GAPS)}\n"
        f"Constaté : {sorted(missing)}"
    )


def test_no_python_only_achievements():
    """Aucun trophée ne doit exister côté Python sans exister côté JS : le front
    afficherait un trophée que le backend ne sait pas nommer."""
    extra = _py_achievement_ids() - _js_achievement_ids()
    assert extra == set(), f"Trophées Python sans équivalent JS : {sorted(extra)}"


@pytest.mark.xfail(reason="12 trophées manquants côté Python, ajoutés en D2", strict=False)
def test_catalogs_are_identical():
    """La cible : ensembles d'ids strictement égaux. Passe au vert une fois D2
    mergée — le xfail devient alors un xpass, signal qu'on peut retirer ce
    décorateur."""
    assert _js_achievement_ids() == _py_achievement_ids()
