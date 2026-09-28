from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

PREVIOUS_REVISION = "20260814_sisca_uat_audit"
NUMERIC_REVISION = "20260910_numeric_rewards_ids"


def _config(database_url: str) -> Config:
    project_root = Path(__file__).resolve().parents[3]
    config = Config(str(project_root / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


async def _seed_previous_state(database_url: str) -> tuple[str, str]:
    engine = create_async_engine(database_url)
    legacy_customer_id = str(uuid4())
    numeric_customer_id = str(uuid4())
    now = datetime.now(UTC)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    """
                    INSERT INTO customers (
                        id, rewards_id, curp, first_name, last_name, email, phone,
                        postal_code, state, city, customer_status, onboarding_status,
                        created_at, updated_at
                    ) VALUES
                    (
                        :legacy_id, 'RWD-LEGACY-TEST', 'LEGA900101HMNLRS01',
                        'Legacy', 'Customer', 'legacy@example.test', '5550000001',
                        '01010', 'CDMX', 'Ciudad de Mexico', 'ACTIVE', 'COMPLETED',
                        :now, :now
                    ),
                    (
                        :numeric_id, '990910002', 'NUME900101HMNLRS02',
                        'Numeric', 'Customer', 'numeric@example.test', '5550000002',
                        '01010', 'CDMX', 'Ciudad de Mexico', 'ACTIVE', 'COMPLETED',
                        :now, :now
                    )
                    """
                ),
                {"legacy_id": legacy_customer_id, "numeric_id": numeric_customer_id, "now": now},
            )
            await connection.execute(
                text(
                    """
                    CREATE TABLE bonda_affiliate_provisioning (
                        customer_id uuid PRIMARY KEY,
                        rewards_id varchar(200) NOT NULL UNIQUE,
                        updated_at timestamptz NOT NULL
                    )
                    """
                )
            )
            await connection.execute(
                text(
                    """
                    INSERT INTO bonda_affiliate_provisioning (
                        customer_id, rewards_id, updated_at
                    ) VALUES (:customer_id, 'RWD-LEGACY-TEST', :now)
                    """
                ),
                {"customer_id": legacy_customer_id, "now": now},
            )
    finally:
        await engine.dispose()
    return legacy_customer_id, numeric_customer_id


async def _assert_upgraded(
    database_url: str,
    legacy_customer_id: str,
    numeric_customer_id: str,
) -> str:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            migrated = (
                await connection.execute(
                    text(
                        """
                        SELECT customer.rewards_id, customer.curp, customer.email,
                               mapping.previous_rewards_id, mapping.numeric_rewards_id,
                               provisioning.rewards_id AS provisioning_rewards_id
                        FROM customers AS customer
                        JOIN customer_rewards_id_migrations AS mapping
                          ON mapping.customer_id = customer.id
                        JOIN bonda_affiliate_provisioning AS provisioning
                          ON provisioning.customer_id = customer.id
                        WHERE customer.id = :customer_id
                        """
                    ),
                    {"customer_id": legacy_customer_id},
                )
            ).one()
            preserved_numeric = await connection.scalar(
                text("SELECT rewards_id FROM customers WHERE id = :customer_id"),
                {"customer_id": numeric_customer_id},
            )
            mapping_count = await connection.scalar(
                text("SELECT count(*) FROM customer_rewards_id_migrations")
            )

        assert migrated.rewards_id.isascii() and migrated.rewards_id.isdecimal()
        assert len(migrated.rewards_id) == 9 and migrated.rewards_id[0] != "0"
        assert migrated.rewards_id == migrated.numeric_rewards_id
        assert migrated.rewards_id == migrated.provisioning_rewards_id
        assert migrated.previous_rewards_id == "RWD-LEGACY-TEST"
        assert migrated.curp == "LEGA900101HMNLRS01"
        assert migrated.email == "legacy@example.test"
        assert preserved_numeric == "990910002"
        assert mapping_count == 1

        async with engine.connect() as connection:
            transaction = await connection.begin()
            with pytest.raises(IntegrityError):
                await connection.execute(
                    text(
                        """
                        UPDATE customers
                        SET rewards_id = 'RWD-NOT-ALLOWED'
                        WHERE id = :customer_id
                        """
                    ),
                    {"customer_id": legacy_customer_id},
                )
            await transaction.rollback()
        return migrated.rewards_id
    finally:
        await engine.dispose()


async def _assert_downgraded(
    database_url: str,
    legacy_customer_id: str,
    migrated_rewards_id: str,
) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            restored = await connection.scalar(
                text("SELECT rewards_id FROM customers WHERE id = :customer_id"),
                {"customer_id": legacy_customer_id},
            )
            provisioning = await connection.scalar(
                text(
                    """
                    SELECT rewards_id
                    FROM bonda_affiliate_provisioning
                    WHERE customer_id = :customer_id
                    """
                ),
                {"customer_id": legacy_customer_id},
            )
            mapping_table = await connection.scalar(
                text("SELECT to_regclass('public.customer_rewards_id_migrations')")
            )

        assert migrated_rewards_id != restored
        assert restored == "RWD-LEGACY-TEST"
        assert provisioning == "RWD-LEGACY-TEST"
        assert mapping_table is None
    finally:
        await engine.dispose()


async def _drop_test_bonda_table(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("DROP TABLE IF EXISTS bonda_affiliate_provisioning"))
    finally:
        await engine.dispose()


@pytest.mark.integration
def test_numeric_rewards_id_migration_is_atomic_auditable_and_reversible(
    postgres_database_url: str,
) -> None:
    config = _config(postgres_database_url)
    command.downgrade(config, "base")
    try:
        command.upgrade(config, PREVIOUS_REVISION)
        legacy_customer_id, numeric_customer_id = asyncio.run(
            _seed_previous_state(postgres_database_url)
        )
        command.upgrade(config, NUMERIC_REVISION)
        migrated_rewards_id = asyncio.run(
            _assert_upgraded(
                postgres_database_url,
                legacy_customer_id,
                numeric_customer_id,
            )
        )
        command.downgrade(config, PREVIOUS_REVISION)
        asyncio.run(
            _assert_downgraded(
                postgres_database_url,
                legacy_customer_id,
                migrated_rewards_id,
            )
        )
    finally:
        asyncio.run(_drop_test_bonda_table(postgres_database_url))
        command.downgrade(config, "base")
