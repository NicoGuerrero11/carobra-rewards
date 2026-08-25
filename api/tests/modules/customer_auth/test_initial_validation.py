from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.modules.customer_auth.application.models import (
    CustomerProfile,
    RegisterCustomerCommand,
    RegistrationResult,
)
from carobra_rewards.modules.customer_auth.application.service import CustomerAuthService
from carobra_rewards.modules.sisca_validation.application.models import (
    ValidationExecutionResult,
)
from carobra_rewards.modules.sisca_validation.domain.models import (
    ValidationCheckOutcome,
    ValidationCheckpoint,
    ValidationStatus,
)

NOW = datetime(2026, 8, 25, 18, 0, tzinfo=UTC)
CUSTOMER_ID = UUID("00000000-0000-0000-0000-000000000701")
VALIDATION_ID = UUID("00000000-0000-0000-0000-000000000702")


def _command() -> RegisterCustomerCommand:
    return RegisterCustomerCommand(
        curp="ABCD123456HMNLRS09",
        first_name="Ada",
        last_name="Lovelace",
        email="ada@example.com",
        phone="5551234567",
        password="correct-horse-7",
        confirm_password="correct-horse-7",
        postal_code="01010",
        state="CDMX",
        city="Ciudad de Mexico",
        terms_accepted=True,
        terms_version="2026-08",
    )


def _registration() -> RegistrationResult:
    return RegistrationResult(
        customer=CustomerProfile(
            id=CUSTOMER_ID,
            rewards_id="RWD-test",
            curp="ABCD123456HMNLRS09",
            first_name="Ada",
            last_name="Lovelace",
            email="ada@example.com",
            phone="5551234567",
            postal_code="01010",
            state="CDMX",
            city="Ciudad de Mexico",
            customer_status="PENDING_VALIDATION",
            onboarding_status="COMPLETED",
        ),
        validation_id=VALIDATION_ID,
        validation_status="PENDING",
        registered_at=NOW,
    )


def _execution(
    status: ValidationStatus,
    outcome: ValidationCheckOutcome,
) -> ValidationExecutionResult:
    return ValidationExecutionResult(
        validation_id=VALIDATION_ID,
        status=status,
        outcome=outcome,
        next_checkpoint=(None if status.is_terminal else ValidationCheckpoint.H24),
        next_checkpoint_at=None if status.is_terminal else NOW + timedelta(hours=24),
        replayed=False,
        stale=False,
        attempts=1,
    )


def _service(initial_validation_check) -> CustomerAuthService:
    unused_factory = cast(async_sessionmaker[AsyncSession], object())
    return CustomerAuthService(
        unused_factory,
        session_ttl=timedelta(days=7),
        initial_validation_check=initial_validation_check,
        clock=lambda: NOW,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("execution", "expected_validation", "expected_customer"),
    [
        (
            _execution(
                ValidationStatus.VALIDATED,
                ValidationCheckOutcome.MATCH_VALIDATED,
            ),
            "VALIDATED",
            "ACTIVE",
        ),
        (
            _execution(
                ValidationStatus.PENDING,
                ValidationCheckOutcome.NO_INFORMATION,
            ),
            "PENDING",
            "PENDING_VALIDATION",
        ),
    ],
)
async def test_registration_runs_initial_sisca_after_persistence(
    monkeypatch: pytest.MonkeyPatch,
    execution: ValidationExecutionResult,
    expected_validation: str,
    expected_customer: str,
) -> None:
    calls: list[str] = []

    async def initial_validation(validation_id: UUID) -> ValidationExecutionResult:
        calls.append("sisca")
        assert validation_id == VALIDATION_ID
        return execution

    service = _service(initial_validation)

    async def register_once(command, now, password_hash):
        calls.append("persisted")
        return _registration()

    monkeypatch.setattr(service, "_register_once", register_once)

    registration = await service.register(_command())

    assert calls == ["persisted"]
    assert registration.validation_status == "PENDING"
    result = await service.run_initial_validation(registration)

    assert calls == ["persisted", "sisca"]
    assert result.validation_status == expected_validation
    assert result.customer.customer_status == expected_customer


@pytest.mark.asyncio
async def test_registration_remains_pending_when_initial_sisca_cannot_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unavailable(_validation_id: UUID) -> ValidationExecutionResult:
        raise RuntimeError("injected SISCA outage")

    service = _service(unavailable)

    async def register_once(command, now, password_hash):
        return _registration()

    monkeypatch.setattr(service, "_register_once", register_once)

    registration = await service.register(_command())
    result = await service.run_initial_validation(registration)

    assert result.validation_status == "PENDING"
    assert result.customer.customer_status == "PENDING_VALIDATION"
