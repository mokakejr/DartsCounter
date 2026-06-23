import uuid

from app.core.redis import redis_client

COOLDOWN_SECONDS = 15 * 60


def _key(player_id: uuid.UUID) -> str:
    return f"ping:cooldown:{player_id}"


async def try_claim_ping(player_id: uuid.UUID) -> bool:
    """Atomically claims the cooldown slot. Returns False (and leaves the
    existing cooldown untouched) if a ping was already sent recently."""
    return bool(await redis_client.set(_key(player_id), "1", nx=True, ex=COOLDOWN_SECONDS))


async def ping_retry_after_seconds(player_id: uuid.UUID) -> int:
    ttl = await redis_client.ttl(_key(player_id))
    return max(ttl, 0)
