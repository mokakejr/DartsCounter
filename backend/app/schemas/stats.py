import uuid

from pydantic import BaseModel


class PlayerStats(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str | None = None
    avatar_url: str | None = None
    flight_image_url: str | None = None
    accent_color: str | None = None
    games: int
    wins: int
    win_rate: float
    elo: int
