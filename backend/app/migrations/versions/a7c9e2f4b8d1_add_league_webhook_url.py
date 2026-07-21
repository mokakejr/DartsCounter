"""add webhook_url to leagues

Revision ID: a7c9e2f4b8d1
Revises: e2f6a9c3d8b1
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a7c9e2f4b8d1'
down_revision: Union[str, Sequence[str], None] = 'e2f6a9c3d8b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('leagues', sa.Column('webhook_url', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('leagues', 'webhook_url')
