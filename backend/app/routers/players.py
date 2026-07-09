from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_player
from app.models import Player
from app.models.elo import GLOBAL_SCOPE
from app.schemas.elo import EloHistoryRead, PlayerEloExtremesRead, PlayerRatingRead
from app.schemas.player import PlayerRead, ProfileUpdate
from app.services import elo_query
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
async def get_me(
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> PlayerRead:
    data = players_service.player_to_read(player)
    data.games_played = await players_service.count_games_played(session, player.id)
    return data


@router.get("/players/me/titles")
async def my_titles(
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    from app.models.title import TITLES
    from app.services import titles as titles_service

    rows = await titles_service.list_titles(session, player.id)
    return [
        {
            "id": r.title_id,
            "label": TITLES[r.title_id].label if r.title_id in TITLES else r.title_id,
            "description": TITLES[r.title_id].description if r.title_id in TITLES else "",
            "unlocked_at": r.unlocked_at,
            "is_equipped": r.is_equipped,
        }
        for r in rows
    ]


@router.post("/players/me/titles/{title_id}/equip", response_model=PlayerRead)
async def equip_title(
    title_id: str,
    player: Player = Depends(get_current_player),
    session: AsyncSession = Depends(get_db),
) -> PlayerRead:
    from app.services import titles as titles_service

    if not await titles_service.equip(session, player.id, title_id):
        raise HTTPException(404, "Title not unlocked")
    await session.refresh(player)
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


@router.get("/players/{name}/ratings", response_model=list[PlayerRatingRead])
async def get_player_ratings(name: str, session: AsyncSession = Depends(get_db)) -> list[PlayerRatingRead]:
    player = await players_service.get_by_name(session, name)
    if player is None:
        raise HTTPException(404, "Player not found")
    rows = await elo_query.get_player_ratings(session, player.id)
    return [PlayerRatingRead(**r) for r in rows]


@router.get("/players/{name}/elo-history", response_model=list[EloHistoryRead])
async def get_player_elo_history(
    name: str,
    scope: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
) -> list[EloHistoryRead]:
    player = await players_service.get_by_name(session, name)
    if player is None:
        raise HTTPException(404, "Player not found")
    rows = await elo_query.get_player_elo_history(session, player.id, scope)
    return [EloHistoryRead(**r) for r in rows]


@router.get("/players/{name}/elo-extremes", response_model=PlayerEloExtremesRead)
async def get_player_elo_extremes(
    name: str,
    scope: str = Query(default=GLOBAL_SCOPE),
    session: AsyncSession = Depends(get_db),
) -> PlayerEloExtremesRead:
    player = await players_service.get_by_name(session, name)
    if player is None:
        raise HTTPException(404, "Player not found")
    data = await elo_query.get_player_elo_extremes(session, player.id, scope)
    return PlayerEloExtremesRead(**data)


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
