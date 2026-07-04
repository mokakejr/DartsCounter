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
    rank: str
    # Only meaningful when the leaderboard is scoped to a league: ghosts
    # (players who left) come back False and are listed unranked at the end.
    is_active: bool = True
    ferveur_xp: int = 0
    ferveur_level: int = 1
    current_streak: int = 0
