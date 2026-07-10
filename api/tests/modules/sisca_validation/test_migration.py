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


def _config(database_url: str) -> Config:
    project_root = Path(__file__).resolve().parents[3]
    config = Config(str(project_root / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


async def _seed_and_assert(database_url: str, *, assert_validation_table: bool) -> None:
    customer_id = uuid4()
    intake_id = uuid4()
    now = datetime.now(UTC)
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            if not assert_validation_table:
                await connection.execute(
                    text(
                        """
                        INSERT INTO customers (
                            id, rewards_id, curp, nss, name, email, phone, postal_code,
                            customer_status, onboarding_status, created_at, updated_at
                        ) VALUES (
                            :id, :rewards_id, :curp, :nss, :name, :email, NULL, NULL,
                            'PENDING_ONBOARDING', 'PENDING', :now, :now
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
                await connection.execute(
                    text(
                        """
                        INSERT INTO customer_intake_requests (
                            id, source, external_request_id, curp, processing_status,
                            processing_details, original_payload, customer_id,
                            received_at, processed_at, created_at, updated_at
                        ) VALUES (
                            :id, 'SISCA', :external_id, :curp, 'APPROVED',
                            NULL, '{}'::jsonb, :customer_id, :now, :now, :now, :now
                        )
                        """
                    ),
                    {
                        "id": intake_id,
                        "external_id": f"legacy-{intake_id}",
                        "curp": str(customer_id).replace("-", "")[:18].upper(),
                        "customer_id": customer_id,
                        "now": now,
                    },
                )
                return
            legacy_count = await connection.scalar(
                text("SELECT count(*) FROM customer_intake_requests WHERE id = :id"),
                {"id": intake_id},
            )
            table_exists = await connection.scalar(
                text("SELECT to_regclass('public.sisca_validations') IS NOT NULL")
            )
            assert legacy_count == 1
            assert table_exists is True
    finally:
        await engine.dispose()


@pytest.mark.integration
def test_upgrade_preserves_legacy_intake_and_downgrade_is_safe(
    postgres_database_url: str,
) -> None:
    config = _config(postgres_database_url)
    command.downgrade(config, "base")
    try:
        command.upgrade(config, "20260703_unique_customer_nss")
        asyncio.run(_seed_and_assert(postgres_database_url, assert_validation_table=False))
        command.upgrade(config, "head")

        # Re-query with stable seeded IDs through a generic preservation count.
        async def assert_preserved() -> None:
            engine = create_async_engine(postgres_database_url)
            try:
                async with engine.connect() as connection:
                    assert (
                        await connection.scalar(
                            text("SELECT count(*) FROM customer_intake_requests")
                        )
                        == 1
                    )
                    assert (
                        await connection.scalar(
                            text("SELECT to_regclass('public.sisca_validations') IS NOT NULL")
                        )
                        is True
                    )
            finally:
                await engine.dispose()

        asyncio.run(assert_preserved())
        command.downgrade(config, "20260703_unique_customer_nss")
        asyncio.run(assert_preserved_legacy_only(postgres_database_url))
    finally:
        command.downgrade(config, "base")


async def assert_preserved_legacy_only(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            legacy_count = await connection.scalar(
                text("SELECT count(*) FROM customer_intake_requests")
            )
            assert legacy_count == 1
            assert (
                await connection.scalar(
                    text("SELECT to_regclass('public.sisca_validations') IS NULL")
                )
                is True
            )
    finally:
        await engine.dispose()
