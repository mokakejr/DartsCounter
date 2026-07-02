"""add admin logs

Revision ID: b1d3e5f7a9c0
Revises: e1f4a2c9b6d7
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'b1d3e5f7a9c0'
down_revision: Union[str, Sequence[str], None] = 'e1f4a2c9b6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'admin_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('admin_id', sa.UUID(), nullable=True),
        sa.Column('action', sa.Text(), nullable=False),
        sa.Column('entity_type', sa.Text(), nullable=True),
        sa.Column('entity_id', sa.Text(), nullable=True),
        sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['admin_id'], ['players.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_admin_logs_created_at', 'admin_logs', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_admin_logs_created_at', table_name='admin_logs')
    op.drop_table('admin_logs')
