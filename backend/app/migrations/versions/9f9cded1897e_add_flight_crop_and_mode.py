"""add flight crop and mode

Revision ID: 9f9cded1897e
Revises: a4b7f7e9f223
Create Date: 2026-06-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '9f9cded1897e'
down_revision: Union[str, Sequence[str], None] = 'a4b7f7e9f223'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('players', sa.Column('flight_crop_a', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('players', sa.Column('flight_crop_b', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('players', sa.Column('flight_mode', sa.String(), nullable=False, server_default='symmetric'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('players', 'flight_mode')
    op.drop_column('players', 'flight_crop_b')
    op.drop_column('players', 'flight_crop_a')
