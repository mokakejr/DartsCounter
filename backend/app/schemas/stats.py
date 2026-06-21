import uuid

from pydantic import BaseModel


class PlayerStats(BaseModel):
    id: uuid.UUID
    name: str
    games: int
    wins: int
    win_rate: float
    elo: int
