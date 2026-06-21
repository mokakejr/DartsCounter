from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.schemas.player import PlayerRead
from app.services.players import list_players

router = APIRouter(tags=["players"])


@router.get("/players", response_model=list[PlayerRead])
async def get_players(session: AsyncSession = Depends(get_db)) -> list[PlayerRead]:
    return await list_players(session)
