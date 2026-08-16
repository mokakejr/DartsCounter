"""add elo_history.season_id and backfill from games

Dénormalise la saison sur elo_history, pour que les courbes d'Elo par saison
(dont celles des saisons passées, désormais conservées) soient interrogeables
sans jointure et de façon indexable.

Backfill depuis games.season_id, lui-même peuplé par la migration précédente.

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-08-16 00:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "elo_history",
        sa.Column("season_id", UUID(as_uuid=True), sa.ForeignKey("seasons.id"), nullable=True),
    )
    op.execute(
        """
        UPDATE elo_history AS eh
        SET season_id = g.season_id
        FROM games AS g
        WHERE g.id = eh.game_id
        """
    )
    op.create_index("ix_elo_history_season_id", "elo_history", ["season_id"])


def downgrade() -> None:
    op.drop_index("ix_elo_history_season_id", table_name="elo_history")
    op.drop_column("elo_history", "season_id")
