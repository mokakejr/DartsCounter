"""unfreeze shanghai variant games wrongly auto-flagged as outliers

The outlier detector used to judge a game's score against the player's
recent history across the whole Shanghai Elo family, whose score scales
are incomparable (classic targets 1-7 vs Random/Crazy targets drawn from
1-20+bull): a perfectly normal ShanghaiBull/Random/Crazy game landed 3+
sigmas above a classic-dominated history and got frozen in PENDING_REVIEW,
never reaching Elo. Homologate those auto-flags; the deploy pipeline's Elo
recompute (app.scripts.recompute_elo, runs right after `alembic upgrade
head`) then lands their deferred ratings. Player-reported games
(flag_reason != 'outlier') are left to the tribunal.

Revision ID: b8d5e3a1c9f2
Revises: a7c9e2f4b8d1
Create Date: 2026-07-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b8d5e3a1c9f2'
down_revision: Union[str, Sequence[str], None] = 'a7c9e2f4b8d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE games
        SET status = 'COMPLETED', flag_reason = NULL
        WHERE status = 'PENDING_REVIEW'
          AND flag_reason = 'outlier'
          AND mode IN ('ShanghaiBull', 'ShanghaiRandom', 'ShanghaiCrazy')
        """
    )


def downgrade() -> None:
    # Data amnesty — the original flags are gone, nothing to restore.
    pass
