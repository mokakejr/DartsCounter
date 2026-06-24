"""rebuild elo rating system

Revision ID: 784b2fcc2033
Revises: 9f9cded1897e
Create Date: 2026-06-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '784b2fcc2033'
down_revision: Union[str, Sequence[str], None] = '9f9cded1897e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('players', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))

    op.create_table(
        'elo_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('starting_rating', sa.Float(), nullable=False),
        sa.Column('convergence', sa.Float(), nullable=False),
        sa.Column('k_factors', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('k_thresholds', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('perf_multiplier_min', sa.Float(), nullable=False),
        sa.Column('perf_multiplier_max', sa.Float(), nullable=False),
        sa.Column('bronze_ceiling', sa.Float(), nullable=False),
        sa.Column('rank_tier_value', sa.Float(), nullable=False),
        sa.Column('champion_multiplier', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.execute(
        """
        INSERT INTO elo_settings (
            id, starting_rating, convergence, k_factors, k_thresholds,
            perf_multiplier_min, perf_multiplier_max,
            bronze_ceiling, rank_tier_value, champion_multiplier
        ) VALUES (
            1, 10000, 4000, '[800, 400, 300, 200]', '[5, 10, 15]',
            0.5, 2.0,
            9000, 1200, 2.5
        )
        """
    )

    op.create_table(
        'score_directions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('mode', sa.String(), nullable=False),
        sa.Column('variant', sa.String(), nullable=True),
        sa.Column('mode_key', sa.String(), nullable=False),
        sa.Column('variant_key', sa.String(), nullable=False),
        sa.Column('lower_is_better', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('mode_key', 'variant_key', name='uq_score_direction'),
    )
    # Seed the one exception known today — every existing variant string
    # ("CutThroat" / "Cut Throat") normalizes to the same key.
    op.execute(
        """
        INSERT INTO score_directions (id, mode, variant, mode_key, variant_key, lower_is_better)
        VALUES (gen_random_uuid(), 'Cricket', 'Cut Throat', 'cricket', 'cutthroat', true),
               (gen_random_uuid(), 'SuperCricket', 'Cut Throat', 'supercricket', 'cutthroat', true)
        """
    )

    op.create_table(
        'player_ratings',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('player_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('scope', sa.String(), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('games_played', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['player_id'], ['players.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('player_id', 'scope', name='uq_player_rating_scope'),
    )

    op.add_column('elo_history', sa.Column('scope', sa.String(), nullable=False, server_default='global'))
    op.add_column('elo_history', sa.Column('perf_multiplier', sa.Float(), nullable=False, server_default='1.0'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('elo_history', 'perf_multiplier')
    op.drop_column('elo_history', 'scope')
    op.drop_table('player_ratings')
    op.drop_table('score_directions')
    op.drop_table('elo_settings')
    op.drop_column('players', 'is_admin')
