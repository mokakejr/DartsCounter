"""remove homologation/anticheat columns (games.status, flag_reason,
reported_by, players.trust_factor)

Une partie gelée en PENDING_REVIEW n'était homologable que depuis le bloc
« Litiges » d'une ligue : hors contexte ligue, elle restait bloquée à vie
(pas d'Elo, hors classement, hors Panthéon). On supprime tout l'anti-cheat —
sans la colonne, plus aucune requête ne discrimine, donc les parties
auparavant PENDING_REVIEW ou VOIDED redeviennent des parties normales.

Après cette migration : déclencher POST /admin/elo/recompute pour rejouer
l'historique complet avec les parties débloquées.

Revision ID: d4b7f1c9a3e6
Revises: c3f8b1d6e4a7
Create Date: 2026-08-14 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd4b7f1c9a3e6'
down_revision: Union[str, Sequence[str], None] = 'c3f8b1d6e4a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('games_reported_by_fkey', 'games', type_='foreignkey')
    op.drop_column('games', 'reported_by')
    op.drop_column('games', 'flag_reason')
    op.drop_column('games', 'status')
    op.drop_column('players', 'trust_factor')


def downgrade() -> None:
    # Les états d'homologation ne sont pas restaurables : tout repart des
    # valeurs par défaut (status COMPLETED, trust_factor 50).
    op.add_column(
        'players', sa.Column('trust_factor', sa.Integer(), server_default='50', nullable=False)
    )
    op.add_column(
        'games', sa.Column('status', sa.String(), server_default='COMPLETED', nullable=False)
    )
    op.add_column('games', sa.Column('flag_reason', sa.String(), nullable=True))
    op.add_column('games', sa.Column('reported_by', sa.UUID(), nullable=True))
    op.create_foreign_key('games_reported_by_fkey', 'games', 'players', ['reported_by'], ['id'])
