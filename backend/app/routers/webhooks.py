from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.schemas.webhook import WebhookConfigIn, WebhookConfigRead, WebhookTestIn
from app.services import notifications, webhooks as webhooks_service
from app.services.targets.base import GameEvent

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

_TEST_EVENT = GameEvent(
    type="game_finished",
    data={"mode": "Cricket", "players": ["Alice", "Bob"], "scores": [301, 250], "winner": "Alice", "duration": 125},
)


@router.get("", response_model=list[WebhookConfigRead])
async def list_webhooks(session: AsyncSession = Depends(get_db)) -> list[WebhookConfigRead]:
    return await webhooks_service.list_webhooks(session)


@router.post("", response_model=WebhookConfigRead, status_code=201)
async def configure_webhook(
    payload: WebhookConfigIn, session: AsyncSession = Depends(get_db)
) -> WebhookConfigRead:
    return await webhooks_service.upsert_webhook(session, payload)


@router.post("/test", status_code=202)
async def test_webhook(payload: WebhookTestIn, session: AsyncSession = Depends(get_db)) -> dict[str, str]:
    target = (await notifications.load_targets(session)).get(payload.target)
    if target is None:
        raise HTTPException(404, f"No URL configured for target '{payload.target}'")
    try:
        await target.send(_TEST_EVENT)
    except Exception as exc:
        raise HTTPException(502, f"Failed to send test notification: {exc}") from exc
    return {"status": "sent"}
