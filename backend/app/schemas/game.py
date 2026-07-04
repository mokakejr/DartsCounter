import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator


class GameCreate(BaseModel):
    id: uuid.UUID | None = None  # client-supplied for offline-queue retry idempotency
    date: datetime
    mode: str
    variant: str | None = None
    duration: int = 0
    players: list[str]
    scores: list[int]
    winner: str | None = None  # None/empty for a tie — Shanghai allows this
    is_casual: bool = False  # excluded from Elo, still recorded for personal history
    # Generic per-mode metadata bag (e.g. Bob's 27's rounds_completed/busted) —
    # preserved via raw_data without every mode needing its own typed fields.
    extra: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _check_consistency(self) -> "GameCreate":
        if len(self.players) != len(self.scores):
            raise ValueError("players and scores must have the same length")
        if not self.players:
            raise ValueError("players must not be empty")
        if self.winner and self.winner not in self.players:
            raise ValueError("winner must be one of players")
        return self


class GamePlayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    score: int
    position: int


class GameRead(BaseModel):
    id: uuid.UUID
    date: datetime
    mode: str
    variant: str | None
    duration: int
    winner: str | None
    is_casual: bool
    # COMPLETED | PENDING_REVIEW | VOIDED — PENDING_REVIEW means the outlier
    # detector froze it: no Elo yet, the client shows the homologation modal.
    status: str = "COMPLETED"
    extra: dict[str, Any] | None = None
    players: list[GamePlayerRead]
