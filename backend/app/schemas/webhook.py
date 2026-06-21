import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

TargetName = Literal["google_chat", "discord"]


class WebhookConfigIn(BaseModel):
    target: TargetName
    url: str
    enabled: bool = True


class WebhookConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    target: str
    url: str
    enabled: bool
    created_at: datetime


class WebhookTestIn(BaseModel):
    target: TargetName
