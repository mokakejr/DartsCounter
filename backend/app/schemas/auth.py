from pydantic import BaseModel, Field

from app.schemas.player import PlayerRead


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=20)
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    name: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    player: PlayerRead
