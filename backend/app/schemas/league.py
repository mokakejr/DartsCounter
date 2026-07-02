import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LeagueMemberRead(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str | None = None
    avatar_url: str | None = None


class LeagueRead(BaseModel):
    id: uuid.UUID
    name: str
    owner_id: uuid.UUID
    invite_code: str
    created_at: datetime
    members: list[LeagueMemberRead]


class LeagueCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class LeagueUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class LeagueJoin(BaseModel):
    code: str = Field(min_length=1, max_length=16)


class MemberAdd(BaseModel):
    name: str = Field(min_length=1)
