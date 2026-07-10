from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from carobra_rewards.core.config import get_settings, reset_settings_cache
from carobra_rewards.infrastructure.database.session import reset_engine_cache

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def get_test_database_url() -> str | None:
    from_environment = os.getenv("TEST_DATABASE_URL")
    if from_environment:
        return from_environment

    settings = get_settings()
    if settings.test_database_url is None:
        return None

    return settings.test_database_url.get_secret_value()


def get_primary_database_url() -> str | None:
    from_environment = os.getenv("DATABASE_URL")
    if from_environment:
        return from_environment

    settings = get_settings()
    if settings.database_url is None:
        return None

    return settings.database_url.get_secret_value()


def _build_alembic_config(database_url: str) -> Config:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


@pytest.fixture
def postgres_database_url(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    database_url = get_test_database_url()
    if database_url is None:
        pytest.skip("TEST_DATABASE_URL is not configured.")
    primary_database_url = get_primary_database_url()
    if primary_database_url is not None and primary_database_url == database_url:
        raise RuntimeError("TEST_DATABASE_URL must be different from DATABASE_URL.")

    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("TEST_DATABASE_URL", database_url)
    monkeypatch.setenv("APP_ENV", "test")
    reset_settings_cache()
    reset_engine_cache()
    yield database_url
    reset_engine_cache()
    reset_settings_cache()


@pytest.fixture
def migrated_postgres_database(postgres_database_url: str) -> Iterator[str]:
    config = _build_alembic_config(postgres_database_url)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    yield postgres_database_url
    command.downgrade(config, "base")


@pytest.fixture
async def postgres_engine(migrated_postgres_database: str) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(migrated_postgres_database, pool_pre_ping=True)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
def postgres_session_factory(
    postgres_engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=postgres_engine,
        autoflush=False,
        expire_on_commit=False,
    )
