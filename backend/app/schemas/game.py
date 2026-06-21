import uuid
from datetime import datetime

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
    players: list[GamePlayerRead]
