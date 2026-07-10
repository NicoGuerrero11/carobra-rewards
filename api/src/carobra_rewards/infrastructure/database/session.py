from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from carobra_rewards.core.config import get_settings


@lru_cache(maxsize=1)
def _build_engine() -> AsyncEngine:
    settings = get_settings()
    database_url = settings.database_url
    if database_url is None:
        raise RuntimeError("DATABASE_URL is not configured.")

    return create_async_engine(
        database_url.get_secret_value(),
        pool_pre_ping=True,
    )


def get_engine() -> AsyncEngine:
    return _build_engine()


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=get_engine(),
        autoflush=False,
        expire_on_commit=False,
    )


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with get_session_factory()() as session:
        yield session


def reset_engine_cache() -> None:
    _build_engine.cache_clear()
