from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_player
from app.models import Player
from app.schemas.player import PlayerRead, ProfileUpdate
from app.services import ping as ping_service
from app.services import players as players_service
from app.services.notifications import notify
from app.services.targets.base import GameEvent
from app.services.uploads import InvalidImageError, Slot, save_image

router = APIRouter(tags=["players"])


@router.get("/players", response_model=list[PlayerRead])
async def get_players(session: AsyncSession = Depends(get_db)) -> list[PlayerRead]:
    return await players_service.list_players(session)


@router.get("/players/me", response_model=PlayerRead)
async def get_me(player: Player = Depends(get_current_player)) -> PlayerRead:
    return players_service.player_to_read(player)


@router.patch("/players/me", response_model=PlayerRead)
async def update_me(
    payload: ProfileUpdate,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> PlayerRead:
    try:
        player = await players_service.update_profile(session, player, payload.model_dump(exclude_unset=True))
    except players_service.NameTakenError:
        raise HTTPException(409, "This name is already taken")
    return players_service.player_to_read(player)


@router.post("/players/me/image", response_model=PlayerRead)
async def upload_my_image(
    slot: Slot = Query(...),
    file: UploadFile = File(...),
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> PlayerRead:
    try:
        path = await save_image(file, slot)
    except InvalidImageError as exc:
        raise HTTPException(400, str(exc))
    player = await players_service.set_image_path(session, player, slot, path)
    return players_service.player_to_read(player)


@router.post("/players/ping", status_code=202)
async def ping(
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> dict:
    if not await ping_service.try_claim_ping(player.id):
        retry_after = await ping_service.ping_retry_after_seconds(player.id)
        raise HTTPException(429, detail={"retry_after_seconds": retry_after})

    event = GameEvent(type="player_ping", data={"by": player.display_name or player.name})
    await notify(session, event)
    return {"status": "sent"}
