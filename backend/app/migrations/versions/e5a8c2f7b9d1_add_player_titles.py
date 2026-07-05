"""add player_titles (contextual title engine)

Revision ID: e5a8c2f7b9d1
Revises: d7f3b9e2a6c5
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e5a8c2f7b9d1'
down_revision: Union[str, Sequence[str], None] = 'd7f3b9e2a6c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'player_titles',
        sa.Column('player_id', sa.UUID(), nullable=False),
        sa.Column('title_id', sa.Text(), nullable=False),
        sa.Column('unlocked_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('is_equipped', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('player_id', 'title_id'),
    )


def downgrade() -> None:
    op.drop_table('player_titles')
