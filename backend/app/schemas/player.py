import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


class PlayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    display_name: str | None = None
    avatar_url: str | None = None
    flight_image_url: str | None = None
    accent_color: str | None = None
    created_at: datetime


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=20)
    display_name: str | None = Field(default=None, max_length=40)
    accent_color: str | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("accent_color")
    @classmethod
    def _validate_hex(cls, value: str | None) -> str | None:
        if value is not None and not _HEX_COLOR.match(value):
            raise ValueError("accent_color must be a hex color like #E61E2A")
        return value
