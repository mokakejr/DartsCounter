"""add season_ratings (soft reset baseline) and tournaments

Revision ID: e2f6a9c3d8b1
Revises: f9b4d7a2c5e8
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e2f6a9c3d8b1'
down_revision: Union[str, Sequence[str], None] = 'f9b4d7a2c5e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'season_ratings',
        sa.Column('season_id', sa.UUID(), nullable=False),
        sa.Column('player_id', sa.UUID(), nullable=False),
        sa.Column('scope', sa.String(), nullable=False),
        sa.Column('rating', sa.Float(), nullable=False),
        sa.Column('games_played', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['season_id'], ['seasons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('season_id', 'player_id', 'scope'),
    )
    op.create_table(
        'tournaments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('league_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('mode', sa.Text(), nullable=False),
        sa.Column('goal', sa.Text(), nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('max_tickets', sa.Integer(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('reminder_sent', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('closed_announced', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['league_id'], ['leagues.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['players.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tournaments_league_id', 'tournaments', ['league_id'])
    op.create_table(
        'tournament_entries',
        sa.Column('tournament_id', sa.UUID(), nullable=False),
        sa.Column('player_id', sa.UUID(), nullable=False),
        sa.Column('tickets_used', sa.Integer(), nullable=False),
        sa.Column('best_value', sa.Integer(), nullable=True),
        sa.Column('best_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('attempt_in_progress', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tournament_id'], ['tournaments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('tournament_id', 'player_id'),
    )


def downgrade() -> None:
    op.drop_table('tournament_entries')
    op.drop_index('ix_tournaments_league_id', table_name='tournaments')
    op.drop_table('tournaments')
    op.drop_table('season_ratings')
