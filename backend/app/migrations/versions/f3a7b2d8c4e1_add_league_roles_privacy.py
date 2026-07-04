"""add league roles, privacy, join requests, ghost members, last_login

Revision ID: f3a7b2d8c4e1
Revises: d4e8a1c5f2b9
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f3a7b2d8c4e1'
down_revision: Union[str, Sequence[str], None] = 'd4e8a1c5f2b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('league_members', sa.Column('role', sa.Text(), server_default='member', nullable=False))
    op.add_column('league_members', sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False))
    # Owners already recorded on leagues.owner_id get the matching role.
    op.execute(
        "UPDATE league_members lm SET role = 'owner' "
        "FROM leagues l WHERE l.id = lm.league_id AND l.owner_id = lm.player_id"
    )

    op.add_column('leagues', sa.Column('motto', sa.Text(), nullable=True))
    op.add_column('leagues', sa.Column('icon', sa.Text(), nullable=True))
    op.add_column('leagues', sa.Column('privacy_level', sa.Text(), server_default='PRIVATE_CODE', nullable=False))

    op.add_column('players', sa.Column('last_login', sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        'league_join_requests',
        sa.Column('league_id', sa.UUID(), nullable=False),
        sa.Column('player_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.Text(), server_default='PENDING', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['league_id'], ['leagues.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('league_id', 'player_id'),
    )


def downgrade() -> None:
    op.drop_table('league_join_requests')
    op.drop_column('players', 'last_login')
    op.drop_column('leagues', 'privacy_level')
    op.drop_column('leagues', 'icon')
    op.drop_column('leagues', 'motto')
    op.drop_column('league_members', 'is_active')
    op.drop_column('league_members', 'role')
