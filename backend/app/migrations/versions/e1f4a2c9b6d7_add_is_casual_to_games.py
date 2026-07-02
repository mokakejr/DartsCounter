"""add is_casual to games

Revision ID: e1f4a2c9b6d7
Revises: 784b2fcc2033
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e1f4a2c9b6d7'
down_revision: Union[str, Sequence[str], None] = '784b2fcc2033'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'games',
        sa.Column('is_casual', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('games', 'is_casual')
