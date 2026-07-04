"""add games.flag_reason and games.reported_by (tribunal)

Revision ID: d7f3b9e2a6c5
Revises: c8e2a5f9d1b4
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd7f3b9e2a6c5'
down_revision: Union[str, Sequence[str], None] = 'c8e2a5f9d1b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('games', sa.Column('flag_reason', sa.String(), nullable=True))
    op.add_column('games', sa.Column('reported_by', sa.UUID(), nullable=True))
    op.create_foreign_key('games_reported_by_fkey', 'games', 'players', ['reported_by'], ['id'])


def downgrade() -> None:
    op.drop_constraint('games_reported_by_fkey', 'games', type_='foreignkey')
    op.drop_column('games', 'reported_by')
    op.drop_column('games', 'flag_reason')
