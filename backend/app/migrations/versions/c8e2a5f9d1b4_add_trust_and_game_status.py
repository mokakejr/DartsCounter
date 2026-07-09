"""add players.trust_factor and games.status (homologation)

Revision ID: c8e2a5f9d1b4
Revises: b6d1f4a8c7e2
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c8e2a5f9d1b4'
down_revision: Union[str, Sequence[str], None] = 'b6d1f4a8c7e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('players', sa.Column('trust_factor', sa.Integer(), server_default='50', nullable=False))
    op.add_column('games', sa.Column('status', sa.String(), server_default='COMPLETED', nullable=False))


def downgrade() -> None:
    op.drop_column('games', 'status')
    op.drop_column('players', 'trust_factor')
