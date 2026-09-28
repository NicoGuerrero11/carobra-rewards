from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from typing import cast
from unittest.mock import Mock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.modules.customer_auth.application.models import (
    InvalidBirthDateError,
    RegisterCustomerCommand,
)
from carobra_rewards.modules.customer_auth.application.service import CustomerAuthService
from carobra_rewards.modules.customer_auth.domain.birth_date import (
    REGISTRATION_TIMEZONE,
    parse_birth_date,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    AuthUserModel,
    CustomerConsentModel,
    CustomerModel,
)
from carobra_rewards.modules.sisca_validation.infrastructure.persistence.models import (
    SiscaValidationModel,
)

NOW = datetime(2026, 9, 28, 2, tzinfo=UTC)


def command(birth_date=None):
    return RegisterCustomerCommand(
        curp="ABCD123456HMNLRS09",
        first_name="Test",
        last_name="Customer",
        email="birthday@example.test",
        phone="5551234567",
        password="correct-horse-7",
        confirm_password="correct-horse-7",
        postal_code="01010",
        state="CDMX",
        city="Mexico",
        terms_accepted=True,
        terms_version="2026-07",
        birth_date=birth_date,
    )


def test_birth_date_is_date_only_and_uses_the_mexico_calendar_day():
    today = NOW.astimezone(REGISTRATION_TIMEZONE).date()
    assert today == date(2026, 9, 27)
    assert parse_birth_date("2026-09-27", today=today) == today
    assert parse_birth_date("1992-02-29", today=today) == date(1992, 2, 29)
    assert parse_birth_date(None, today=today) is None
    for invalid in ["2026-09-28", "1900-02-29", "2025-02-29", NOW, 0, "1990-01-01T00:00:00Z"]:
        with pytest.raises(InvalidBirthDateError):
            parse_birth_date(invalid, today=today)


@pytest.mark.asyncio
async def test_service_rejects_future_birth_date_before_opening_a_transaction():
    factory = Mock(side_effect=AssertionError("Database must not be reached"))
    service = CustomerAuthService(factory, session_ttl=timedelta(days=7), clock=lambda: NOW)
    with pytest.raises(InvalidBirthDateError):
        await service.register(command(date(2026, 9, 28)))
    factory.assert_not_called()


class RecordingSession:
    def __init__(self):
        self.models = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    @asynccontextmanager
    async def begin(self):
        yield self

    def add(self, model):
        self.models.append(model)

    async def flush(self):
        pass


@pytest.mark.asyncio
@pytest.mark.parametrize("value", [None, date(1992, 2, 29)])
async def test_registration_stores_self_reported_date_without_verified_birthday_records(value):
    session = RecordingSession()
    service = CustomerAuthService(
        cast(async_sessionmaker[AsyncSession], lambda: session),
        session_ttl=timedelta(days=7),
        clock=lambda: NOW,
    )
    result = await service.register(command(value))
    assert [type(model) for model in session.models] == [
        AuthUserModel,
        CustomerModel,
        CustomerConsentModel,
        SiscaValidationModel,
    ]
    assert session.models[1].birth_date == value
    assert result.customer.birth_date == value
    assert result.customer.customer_status == "PENDING_VALIDATION"
