"""add league_events (30-day feed) and league_pantheon (permanent records)

Revision ID: f9b4d7a2c5e8
Revises: e5a8c2f7b9d1
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f9b4d7a2c5e8'
down_revision: Union[str, Sequence[str], None] = 'e5a8c2f7b9d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'league_events',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('league_id', sa.UUID(), nullable=False),
        sa.Column('event_type', sa.Text(), nullable=False),
        sa.Column('actor_id', sa.UUID(), nullable=False),
        sa.Column('target_id', sa.UUID(), nullable=True),
        sa.Column('story_text', sa.Text(), nullable=False),
        sa.Column('respect_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['league_id'], ['leagues.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['actor_id'], ['players.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_league_events_league_id', 'league_events', ['league_id'])
    op.create_index('ix_league_events_created_at', 'league_events', ['created_at'])

    op.create_table(
        'league_pantheon',
        sa.Column('league_id', sa.UUID(), nullable=False),
        sa.Column('pillar', sa.Text(), nullable=False),
        sa.Column('holder_id', sa.UUID(), nullable=False),
        sa.Column('value', sa.Integer(), nullable=False),
        sa.Column('achieved_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['league_id'], ['leagues.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['holder_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('league_id', 'pillar'),
    )


def downgrade() -> None:
    op.drop_table('league_pantheon')
    op.drop_index('ix_league_events_created_at', table_name='league_events')
    op.drop_index('ix_league_events_league_id', table_name='league_events')
    op.drop_table('league_events')
