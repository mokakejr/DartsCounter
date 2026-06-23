"""Test setup.

Tests run against a real Postgres database (JSONB, native UUID, and window
functions used by the leaderboard/Elo queries don't have a SQLite
equivalent), kept isolated from the dev database via POSTGRES_DB below.

These env vars must be set before anything under `app` is imported, since
app.core.config.Settings is read once (lru_cache) on first use.
"""

import os

os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("POSTGRES_DB", "dartscounter_test")

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.core.db import Base, engine
from app.main import app


async def _ensure_test_database() -> None:
    settings = get_settings()
    admin_url = settings.database_url.rsplit("/", 1)[0] + "/postgres"
    admin_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        async with admin_engine.connect() as conn:
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": settings.postgres_db},
            )
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{settings.postgres_db}"'))
    finally:
        await admin_engine.dispose()


@pytest.fixture(scope="session", autouse=True)
async def _database() -> AsyncIterator[None]:
    await _ensure_test_database()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
    yield


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    """Image uploads (avatar/flight) would otherwise land in the real
    ./uploads dir next to the repo — point them at pytest's per-test tmp_path
    instead, which it cleans up on its own."""
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path / "uploads"))


class FakeAsyncClient:
    """Stands in for httpx.AsyncClient in notification targets so tests
    never hit a real webhook."""

    calls: list[tuple[str, dict]] = []
    fail: bool = False

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *args) -> bool:
        return False

    async def post(self, url: str, json: dict):
        if FakeAsyncClient.fail:
            raise RuntimeError("boom")
        FakeAsyncClient.calls.append((url, json))

        class _Resp:
            def raise_for_status(self) -> None:
                pass

        return _Resp()


@pytest.fixture
def fake_httpx(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.fail = False
    monkeypatch.setattr("app.services.targets.google_chat.httpx.AsyncClient", FakeAsyncClient)
    monkeypatch.setattr("app.services.targets.discord.httpx.AsyncClient", FakeAsyncClient)
    yield FakeAsyncClient


class FakeRedis:
    """Stands in for app.core.redis.redis_client — an in-memory dict is plenty
    for exercising the ping cooldown's NX/EX/TTL semantics in tests."""

    def __init__(self) -> None:
        self.store: dict[str, tuple[str, float | None]] = {}

    async def set(self, key: str, value: str, nx: bool = False, ex: int | None = None) -> bool | None:
        import time

        now = time.monotonic()
        existing = self.store.get(key)
        if nx and existing is not None and (existing[1] is None or existing[1] > now):
            return None
        self.store[key] = (value, now + ex if ex is not None else None)
        return True

    async def ttl(self, key: str) -> int:
        import time

        existing = self.store.get(key)
        if existing is None or existing[1] is None:
            return -1
        return max(int(existing[1] - time.monotonic()), 0)


@pytest.fixture
def fake_redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr("app.services.ping.redis_client", fake)
    yield fake
