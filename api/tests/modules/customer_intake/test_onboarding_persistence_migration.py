from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

PREVIOUS_REVISION = "20260709_sisca_validation"


def _config(database_url: str) -> Config:
    project_root = Path(__file__).resolve().parents[3]
    config = Config(str(project_root / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


async def _seed_legacy_customer(database_url: str) -> None:
    now = datetime.now(UTC)
    customer_id = uuid4()
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    """
                    INSERT INTO customers (
                        id, rewards_id, curp, nss, name, email, phone, postal_code,
                        customer_status, onboarding_status, created_at, updated_at
                    ) VALUES (
                        :id, :rewards_id, :curp, :nss, :name, :email, NULL, NULL,
                        'PENDING_VALIDATION', 'COMPLETED', :now, :now
                    )
                    """
                ),
                {
                    "id": customer_id,
                    "rewards_id": f"RWD-{customer_id}",
                    "curp": str(customer_id).replace("-", "")[:18].upper(),
                    "nss": str(customer_id.int)[:16],
                    "name": "Legacy Customer",
                    "email": "legacy@example.test",
                    "now": now,
                },
            )
    finally:
        await engine.dispose()


async def _assert_upgraded(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            tables = {
                "auth_users": await connection.scalar(
                    text("SELECT to_regclass('public.auth_users')")
                ),
                "auth_sessions": await connection.scalar(
                    text("SELECT to_regclass('public.auth_sessions')")
                ),
                "customer_consents": await connection.scalar(
                    text("SELECT to_regclass('public.customer_consents')")
                ),
            }
            customer_columns = set(
                (
                    await connection.execute(
                        text(
                            """
                            SELECT column_name
                            FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'customers'
                            """
                        )
                    )
                ).scalars()
            )
            customer = (
                await connection.execute(
                    text(
                        """
                        SELECT auth_user_id, first_name, last_name, phone, postal_code, state, city
                        FROM customers
                        """
                    )
                )
            ).one()

        assert all(tables.values())
        assert "nss" not in customer_columns
        assert "name" not in customer_columns
        assert {
            "auth_user_id",
            "first_name",
            "last_name",
            "phone",
            "postal_code",
            "state",
            "city",
        }.issubset(customer_columns)
        assert customer == (None, "Legacy Customer", "", "", "", "", "")
    finally:
        await engine.dispose()


async def _assert_downgraded(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            removed_tables = [
                await connection.scalar(text(f"SELECT to_regclass('public.{table}')"))
                for table in ("auth_users", "auth_sessions", "customer_consents")
            ]
            customer = (await connection.execute(text("SELECT name, nss FROM customers"))).one()

        assert removed_tables == [None, None, None]
        assert customer.name == "Legacy Customer"
        assert customer.nss.startswith("LEGACY")
        assert len(customer.nss) == 16
    finally:
        await engine.dispose()


@pytest.mark.integration
def test_onboarding_persistence_upgrade_and_downgrade_preserve_legacy_customer(
    postgres_database_url: str,
) -> None:
    config = _config(postgres_database_url)
    command.downgrade(config, "base")
    try:
        command.upgrade(config, PREVIOUS_REVISION)
        asyncio.run(_seed_legacy_customer(postgres_database_url))
        command.upgrade(config, "head")
        asyncio.run(_assert_upgraded(postgres_database_url))
        command.downgrade(config, PREVIOUS_REVISION)
        asyncio.run(_assert_downgraded(postgres_database_url))
    finally:
        command.downgrade(config, "base")
