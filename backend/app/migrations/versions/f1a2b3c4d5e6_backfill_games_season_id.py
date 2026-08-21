"""backfill games.season_id from game date

La colonne games.season_id existait depuis le schéma initial mais n'a jamais
été écrite : le rattachement d'une partie à sa saison se faisait entièrement
par comparaison de dates au moment des requêtes. À partir de la PR C2 elle est
peuplée à la création ; cette migration rattrape l'historique existant.

Chaque partie est rattachée à la saison dont la fenêtre [start_date, end_date]
contient sa date. La borne haute est inclusive et tolère une end_date nulle
(saison encore ouverte). Une partie sans saison correspondante (antérieure à
la première saison) reste à NULL — la colonne est nullable.

Revision ID: f1a2b3c4d5e6
Revises: d4b7f1c9a3e6
Create Date: 2026-08-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "d4b7f1c9a3e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE games AS g
        SET season_id = s.id
        FROM seasons AS s
        WHERE s.start_date IS NOT NULL
          AND g.date::date >= s.start_date
          AND (s.end_date IS NULL OR g.date::date <= s.end_date)
          AND g.season_id IS NULL
        """
    )


def downgrade() -> None:
    # Aucune donnée n'est détruite : on ne fait que retirer un rattachement
    # entièrement re-dérivable des dates.
    op.execute("UPDATE games SET season_id = NULL")
