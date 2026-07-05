"""add ferveur xp/level and daily play streak to players

Revision ID: b6d1f4a8c7e2
Revises: a9c4e7f1b2d3
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b6d1f4a8c7e2'
down_revision: Union[str, Sequence[str], None] = 'a9c4e7f1b2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('players', sa.Column('ferveur_xp', sa.BigInteger(), server_default='0', nullable=False))
    op.add_column('players', sa.Column('ferveur_level', sa.Integer(), server_default='1', nullable=False))
    op.add_column('players', sa.Column('current_streak', sa.Integer(), server_default='0', nullable=False))
    op.add_column('players', sa.Column('last_streak_update', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('players', 'last_streak_update')
    op.drop_column('players', 'current_streak')
    op.drop_column('players', 'ferveur_level')
    op.drop_column('players', 'ferveur_xp')
