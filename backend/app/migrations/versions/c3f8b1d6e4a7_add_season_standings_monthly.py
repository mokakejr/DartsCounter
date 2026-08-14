"""add season_standings (palmarès) and align seasons on calendar months

Revision ID: c3f8b1d6e4a7
Revises: b8d5e3a1c9f2
Create Date: 2026-07-30 00:00:00.000000

Les saisons tournaient sur 60 jours glissants ; elles suivent désormais le
calendrier (clôture le 1er du mois). Cette révision crée la table d'archive du
classement (le palmarès) et recadre la saison active sur juillet 2026, pour que
le job quotidien `season_rollover` déclenche la première clôture mensuelle le
1er août 2026 — ou dès la nuit suivant le déploiement s'il a lieu après.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c3f8b1d6e4a7'
down_revision: Union[str, Sequence[str], None] = 'b8d5e3a1c9f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Fin de la première saison mensuelle : le reset demandé pour début août.
FIRST_MONTHLY_END = '2026-07-31'


def upgrade() -> None:
    op.create_table(
        'season_standings',
        sa.Column('season_id', sa.UUID(), nullable=False),
        sa.Column('league_id', sa.UUID(), nullable=False),
        sa.Column('player_id', sa.UUID(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('games', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('wins', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rank_label', sa.Text(), nullable=True),
        sa.Column('is_champion', sa.Boolean(), nullable=False, server_default='false'),
        sa.ForeignKeyConstraint(['season_id'], ['seasons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['league_id'], ['leagues.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('season_id', 'league_id', 'player_id'),
    )
    op.create_index('ix_season_standings_league', 'season_standings', ['league_id', 'season_id'])

    # Recadrage de la saison active. `start_date` est laissé tel quel : c'est
    # la borne que recompute_all utilise pour rejouer la saison, la déplacer
    # invaliderait la baseline season_ratings.
    op.execute(
        sa.text(
            "UPDATE seasons SET end_date = CAST(:end_date AS date), name = 'Juillet 2026'"
            " WHERE is_active IS TRUE"
        ).bindparams(end_date=FIRST_MONTHLY_END)
    )


def downgrade() -> None:
    op.drop_index('ix_season_standings_league', table_name='season_standings')
    op.drop_table('season_standings')
