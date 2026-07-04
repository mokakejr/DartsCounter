"""allow system-owned leagues (Taverne): nullable owner_id

The Taverne row itself is created lazily by the app on first login
(ensure_default_league), so no data seeding here.

Revision ID: a9c4e7f1b2d3
Revises: f3a7b2d8c4e1
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a9c4e7f1b2d3'
down_revision: Union[str, Sequence[str], None] = 'f3a7b2d8c4e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('leagues', 'owner_id', existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM leagues WHERE owner_id IS NULL")
    op.alter_column('leagues', 'owner_id', existing_type=sa.UUID(), nullable=False)
