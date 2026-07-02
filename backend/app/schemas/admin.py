import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class AdminLogRead(BaseModel):
    id: uuid.UUID
    admin_id: uuid.UUID | None
    admin_name: str | None
    action: str
    entity_type: str | None
    entity_id: str | None
    details: dict | None
    created_at: datetime


class AdminPlayerRead(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str | None
    is_admin: bool
    has_account: bool
    created_at: datetime


class AdminPasswordReset(BaseModel):
    new_password: str


class AdminRoleUpdate(BaseModel):
    is_admin: bool


class SeasonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    start_date: date | None
    end_date: date | None
    is_active: bool


class SeasonCreate(BaseModel):
    name: str
    start_date: date | None = None


class SeasonUpdate(BaseModel):
    name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None
