import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_admin
from app.models import Game, Player, WebhookTarget
from app.schemas.admin import (
    AdminLogRead,
    AdminPasswordReset,
    AdminPlayerRead,
    AdminRoleUpdate,
    SeasonCreate,
    SeasonRead,
    SeasonUpdate,
)
from app.schemas.webhook import WebhookConfigRead
from app.services import achievements as ach_service
from app.services import admin as admin_service
from app.services import elo_recompute
from app.services import games as games_service
from app.services.notifications import _BUILDERS
from app.services.targets.base import GameEvent

router = APIRouter(prefix="/admin", tags=["admin"])

_TEST_EVENT = GameEvent(
    type="game_finished",
    data={
        "mode": "Cricket",
        "players": ["Alice", "Bob"],
        "scores": [301, 250],
        "winner": "Alice",
        "duration": 125,
    },
)


# ─── Audit log ────────────────────────────────────────────────────────────────

@router.get("/logs", response_model=list[AdminLogRead])
async def get_logs(
    limit: int = 100,
    _admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> list[AdminLogRead]:
    rows = await admin_service.list_logs(session, limit)
    return [
        AdminLogRead(
            id=r.id,
            admin_id=r.admin_id,
            admin_name=r.admin.name if r.admin else None,
            action=r.action,
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            details=r.details,
            created_at=r.created_at,
        )
        for r in rows
    ]


# ─── Games ────────────────────────────────────────────────────────────────────

@router.delete("/games/{game_id}", status_code=204)
async def delete_game(
    game_id: uuid.UUID,
    admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    game = await session.get(Game, game_id)
    if game is None:
        raise HTTPException(404, "Game not found")

    info = {"mode": game.mode, "date": game.date.isoformat(), "variant": game.variant}
    ok = await admin_service.delete_game(session, game_id)
    if not ok:
        raise HTTPException(404, "Game not found")

    await admin_service.log_action(session, admin.id, "delete_game", "game", str(game_id), info)
    await session.commit()


# ─── ELO & Trophies ───────────────────────────────────────────────────────────

@router.post("/elo/recompute")
async def recompute_elo(
    admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    players_updated = await elo_recompute.recompute_all(session)
    await admin_service.log_action(
        session, admin.id, "recompute_elo", details={"players_updated": players_updated}
    )
    await session.commit()
    return {"players_updated": players_updated}


@router.post("/trophies/recompute")
async def recompute_trophies(
    admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    all_games = await games_service.list_all_games_raw(session)
    stats = ach_service.compute_player_stats(all_games)
    achievements = ach_service.compute_achievements(stats)
    summary = {k: len(v) for k, v in achievements.items()}
    total = sum(summary.values())
    await admin_service.log_action(
        session, admin.id, "recompute_trophies", details={"total_unlocked": total}
    )
    await session.commit()
    return {"total_unlocked": total, "by_achievement": summary}


# ─── Players ──────────────────────────────────────────────────────────────────

@router.get("/players", response_model=list[AdminPlayerRead])
async def list_players(
    _admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> list[AdminPlayerRead]:
    players = await admin_service.list_players(session)
    return [
        AdminPlayerRead(
            id=p.id,
            name=p.name,
            display_name=p.display_name,
            is_admin=p.is_admin,
            has_account=p.password_hash is not None,
            created_at=p.created_at,
        )
        for p in players
    ]


@router.patch("/players/{player_id}/password", status_code=204)
async def reset_password(
    player_id: uuid.UUID,
    payload: AdminPasswordReset,
    admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    ok = await admin_service.reset_password(session, player_id, payload.new_password)
    if not ok:
        raise HTTPException(404, "Player not found")
    await admin_service.log_action(session, admin.id, "reset_password", "player", str(player_id))
    await session.commit()


@router.patch("/players/{player_id}/role", status_code=204)
async def set_role(
    player_id: uuid.UUID,
    payload: AdminRoleUpdate,
    admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    player = await admin_service.set_admin_role(session, player_id, payload.is_admin)
    if player is None:
        raise HTTPException(404, "Player not found")
    await admin_service.log_action(
        session, admin.id, "set_role", "player", str(player_id),
        {"is_admin": payload.is_admin, "target_name": player.name},
    )
    await session.commit()


# ─── Webhooks ─────────────────────────────────────────────────────────────────

@router.get("/webhooks", response_model=list[WebhookConfigRead])
async def list_webhooks(
    _admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> list[WebhookConfigRead]:
    rows = (await session.execute(select(WebhookTarget))).scalars().all()
    return [WebhookConfigRead.model_validate(r) for r in rows]


@router.patch("/webhooks/{webhook_id}/toggle", response_model=WebhookConfigRead)
async def toggle_webhook(
    webhook_id: uuid.UUID,
    admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> WebhookConfigRead:
    wh = await session.get(WebhookTarget, webhook_id)
    if wh is None:
        raise HTTPException(404, "Webhook not found")
    target_name = wh.target
    wh.enabled = not wh.enabled
    new_enabled = wh.enabled
    await admin_service.log_action(
        session, admin.id, "toggle_webhook", "webhook", str(webhook_id),
        {"target": target_name, "enabled": new_enabled},
    )
    await session.commit()
    await session.refresh(wh)
    return WebhookConfigRead.model_validate(wh)


@router.post("/webhooks/{webhook_id}/test", status_code=202)
async def test_webhook(
    webhook_id: uuid.UUID,
    admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    wh = await session.get(WebhookTarget, webhook_id)
    if wh is None:
        raise HTTPException(404, "Webhook not found")
    builder = _BUILDERS.get(wh.target)
    if builder is None:
        raise HTTPException(400, f"Unknown target type: {wh.target}")
    try:
        await builder(wh.url).send(_TEST_EVENT)
    except Exception as exc:
        raise HTTPException(502, f"Send failed: {exc}") from exc
    await admin_service.log_action(
        session, admin.id, "test_webhook", "webhook", str(webhook_id), {"target": wh.target}
    )
    await session.commit()
    return {"status": "sent", "target": wh.target}


# ─── Seasons ──────────────────────────────────────────────────────────────────

@router.get("/seasons", response_model=list[SeasonRead])
async def list_seasons(
    _admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> list[SeasonRead]:
    seasons = await admin_service.list_seasons(session)
    return [SeasonRead.model_validate(s) for s in seasons]


@router.post("/seasons", response_model=SeasonRead, status_code=201)
async def create_season(
    payload: SeasonCreate,
    admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> SeasonRead:
    season = await admin_service.create_season(session, payload.name, payload.start_date)
    # Build response while object is fresh (service called refresh before returning)
    response = SeasonRead.model_validate(season)
    await admin_service.log_action(
        session, admin.id, "create_season", "season", str(season.id),
        {"name": response.name, "start_date": response.start_date.isoformat() if response.start_date else None},
    )
    await session.commit()
    return response


@router.patch("/seasons/{season_id}", response_model=SeasonRead)
async def update_season(
    season_id: uuid.UUID,
    payload: SeasonUpdate,
    admin: Player = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> SeasonRead:
    season = await admin_service.update_season(
        session, season_id, payload.model_dump(exclude_unset=True)
    )
    if season is None:
        raise HTTPException(404, "Season not found")
    # Build response while object is fresh (service called refresh before returning)
    response = SeasonRead.model_validate(season)
    await admin_service.log_action(
        session, admin.id, "update_season", "season", str(season_id),
        payload.model_dump(exclude_unset=True),
    )
    await session.commit()
    return response
