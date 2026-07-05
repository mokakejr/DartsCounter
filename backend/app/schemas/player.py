import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")

FlightMode = Literal["symmetric", "paired"]


class FlightCrop(BaseModel):
    """Relative (0.0-1.0) crop region within the uploaded flight image."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)
    scale: float = Field(default=1.0, gt=0)


class PlayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    display_name: str | None = None
    avatar_url: str | None = None
    flight_image_url: str | None = None
    flight_crop_a: FlightCrop | None = None
    flight_crop_b: FlightCrop | None = None
    flight_mode: FlightMode = "symmetric"
    accent_color: str | None = None
    is_admin: bool = False
    created_at: datetime
    # Only populated on /players/me — feeds the onboarding conversion hook
    # ("3 games played" modal) on the dashboard.
    games_played: int | None = None
    # Ferveur progression + daily play streak (already read-time corrected:
    # 0 once the chain is broken, weekends never break it).
    ferveur_xp: int = 0
    ferveur_level: int = 1
    current_streak: int = 0
    # Equipped contextual title label (Epic 8.1), shown under the username.
    title: str | None = None


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=20)
    display_name: str | None = Field(default=None, max_length=40)
    accent_color: str | None = None
    flight_crop_a: FlightCrop | None = None
    flight_crop_b: FlightCrop | None = None
    flight_mode: FlightMode | None = None

    @field_validator("accent_color")
    @classmethod
    def _validate_hex(cls, value: str | None) -> str | None:
        if value is not None and not _HEX_COLOR.match(value):
            raise ValueError("accent_color must be a hex color like #E61E2A")
        return value
