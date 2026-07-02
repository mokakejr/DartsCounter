"""add min_ranked_games to elo_settings

Revision ID: c2a6e4f81b3d
Revises: b1d3e5f7a9c0
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c2a6e4f81b3d'
down_revision: Union[str, Sequence[str], None] = 'b1d3e5f7a9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'elo_settings',
        sa.Column('min_ranked_games', sa.Integer(), nullable=False, server_default='5'),
    )


def downgrade() -> None:
    op.drop_column('elo_settings', 'min_ranked_games')
