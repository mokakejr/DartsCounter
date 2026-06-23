import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.models import Player

_ALGORITHM = "HS256"
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(player_id: uuid.UUID) -> str:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.auth_token_expire_minutes)
    return jwt.encode(
        {"sub": str(player_id), "exp": expires_at},
        settings.auth_secret_key,
        algorithm=_ALGORITHM,
    )


def decode_access_token(token: str) -> uuid.UUID:
    """Raises jwt.PyJWTError (expired/invalid/malformed) on failure."""
    payload = jwt.decode(token, get_settings().auth_secret_key, algorithms=[_ALGORITHM])
    return uuid.UUID(payload["sub"])


async def get_current_player(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_db),
) -> Player:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if credentials is None:
        raise unauthorized
    try:
        player_id = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise unauthorized
    player = await session.get(Player, player_id)
    if player is None:
        raise unauthorized
    return player
