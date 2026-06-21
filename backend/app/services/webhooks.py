from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import WebhookTarget
from app.schemas.webhook import WebhookConfigIn


async def list_webhooks(session: AsyncSession) -> list[WebhookTarget]:
    return (await session.execute(select(WebhookTarget))).scalars().all()


async def upsert_webhook(session: AsyncSession, payload: WebhookConfigIn) -> WebhookTarget:
    existing = (
        await session.execute(select(WebhookTarget).where(WebhookTarget.target == payload.target))
    ).scalar_one_or_none()
    if existing:
        existing.url = payload.url
        existing.enabled = payload.enabled
        await session.commit()
        return existing

    row = WebhookTarget(target=payload.target, url=payload.url, enabled=payload.enabled)
    session.add(row)
    await session.commit()
    return row
