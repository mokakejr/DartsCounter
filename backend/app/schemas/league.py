import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

PrivacyLevel = Literal["PUBLIC", "PRIVATE_CODE", "APPLICATION"]
MemberRole = Literal["admin", "member"]


class LeagueMemberRead(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str | None = None
    avatar_url: str | None = None
    role: str = "member"
    is_active: bool = True


class LeagueRead(BaseModel):
    id: uuid.UUID
    name: str
    motto: str | None = None
    icon: str | None = None
    privacy_level: str = "PRIVATE_CODE"
    owner_id: uuid.UUID
    invite_code: str
    created_at: datetime
    members: list[LeagueMemberRead]


class LeaguePublicRead(BaseModel):
    """Directory listing for non-members — no invite code, no member details."""

    id: uuid.UUID
    name: str
    motto: str | None = None
    icon: str | None = None
    privacy_level: str
    member_count: int


class LeagueCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    motto: str | None = Field(default=None, max_length=80)
    icon: str | None = Field(default=None, max_length=40)
    privacy_level: PrivacyLevel = "PRIVATE_CODE"


class LeagueUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    motto: str | None = Field(default=None, max_length=80)
    icon: str | None = Field(default=None, max_length=40)
    privacy_level: PrivacyLevel | None = None


class LeagueJoin(BaseModel):
    code: str = Field(min_length=1, max_length=16)


class MemberAdd(BaseModel):
    name: str = Field(min_length=1)


class MemberRoleUpdate(BaseModel):
    role: MemberRole


class OwnershipTransfer(BaseModel):
    player_id: uuid.UUID


class JoinRequestRead(BaseModel):
    league_id: uuid.UUID
    player_id: uuid.UUID
    name: str
    display_name: str | None = None
    avatar_url: str | None = None
    status: str
    created_at: datetime


class JoinRequestDecision(BaseModel):
    action: Literal["accept", "reject"]
