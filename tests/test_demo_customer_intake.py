from __future__ import annotations

from uuid import uuid4

import pytest
from scripts.demo_customer_intake import (
    CreatedRecordIds,
    DemoConfigurationError,
    build_cleanup_statements,
    build_synthetic_payload,
    validate_safe_environment,
)
from sqlalchemy.dialects import postgresql


def test_rejects_missing_test_database_url() -> None:
    with pytest.raises(DemoConfigurationError, match="TEST_DATABASE_URL es obligatorio"):
        validate_safe_environment(
            app_env="test",
            test_database_url=None,
            primary_database_url="postgresql+asyncpg://user:pass@db.example/rewards",
        )


def test_rejects_same_primary_and_test_database_url() -> None:
    database_url = "postgresql+asyncpg://user:pass@db.example/rewards_test"

    with pytest.raises(
        DemoConfigurationError,
        match="DATABASE_URL y TEST_DATABASE_URL no pueden apuntar a la misma base",
    ):
        validate_safe_environment(
            app_env="test",
            test_database_url=database_url,
            primary_database_url=database_url,
        )


def test_generates_unique_synthetic_payloads() -> None:
    first = build_synthetic_payload()
    second = build_synthetic_payload()

    assert first["source"] == "SISCA_SIMULATED"
    assert second["source"] == "SISCA_SIMULATED"
    assert first["external_request_id"] != second["external_request_id"]
    assert first["curp"] != second["curp"]
    assert first["nss"] != second["nss"]
    assert first["email"] != second["email"]
    assert first["phone"] != second["phone"]


def test_cleanup_statements_are_limited_to_created_ids() -> None:
    created_ids = CreatedRecordIds(
        intake_request_ids={uuid4()},
        customer_ids={uuid4()},
        customer_service_ids={uuid4()},
    )

    compiled = [
        str(
            statement.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        for statement in build_cleanup_statements(created_ids)
    ]

    expected_ids = {
        str(next(iter(created_ids.intake_request_ids))),
        str(next(iter(created_ids.customer_ids))),
        str(next(iter(created_ids.customer_service_ids))),
    }

    assert len(compiled) == 3
    assert "DELETE FROM customer_services" in compiled[0]
    assert "DELETE FROM customer_intake_requests" in compiled[1]
    assert "DELETE FROM customers" in compiled[2]
    for statement in compiled:
        assert " IN (" in statement
        assert any(expected_id in statement for expected_id in expected_ids)
