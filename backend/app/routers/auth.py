from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import create_access_token
from app.schemas.auth import LoginRequest, SignupRequest, TokenResponse
from app.services import auth as auth_service
from app.services.players import player_to_read

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=201)
async def signup(payload: SignupRequest, session: AsyncSession = Depends(get_db)) -> TokenResponse:
    try:
        player = await auth_service.signup(session, payload.name, payload.password)
    except auth_service.NameTakenError:
        raise HTTPException(409, "This name is already taken")
    return TokenResponse(access_token=create_access_token(player.id), player=player_to_read(player))


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_db)) -> TokenResponse:
    player = await auth_service.authenticate(session, payload.name, payload.password)
    if player is None:
        raise HTTPException(401, "Invalid name or password")
    return TokenResponse(access_token=create_access_token(player.id), player=player_to_read(player))
