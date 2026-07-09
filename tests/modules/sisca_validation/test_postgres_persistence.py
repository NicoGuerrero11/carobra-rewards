from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    CustomerModel,
    ServiceModel,
)
from carobra_rewards.modules.sisca_validation.application.models import (
    AforeServiceNotConfiguredError,
    ExecuteValidationCheckCommand,
    RegisterCustomerForValidationCommand,
)
from carobra_rewards.modules.sisca_validation.application.service import (
    ExecuteSiscaValidationCheck,
    RegisterCustomerForSiscaValidation,
)
from carobra_rewards.modules.sisca_validation.domain.models import (
    FoundSiscaValidation,
    SiscaGatewayResult,
    SiscaNoInformation,
    ValidationCheckpoint,
    ValidationStatus,
)
from carobra_rewards.modules.sisca_validation.infrastructure.persistence.models import (
    SiscaValidationCheckModel,
    SiscaValidationModel,
)
from carobra_rewards.modules.sisca_validation.infrastructure.persistence.repositories import (
    SqlAlchemySiscaValidationUnitOfWork,
)

NOW = datetime(2026, 7, 9, 18, 0, tzinfo=UTC)
CURP = "ABCD123456HMNLRS09"


class CountingGateway:
    def __init__(self, result: SiscaGatewayResult) -> None:
        self.result = result
        self.calls = 0

    async def query(self, request):
        self.calls += 1
        return self.result


class ControlledGateway(CountingGateway):
    def __init__(self, result: SiscaGatewayResult) -> None:
        super().__init__(result)
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def query(self, request):
        self.calls += 1
        self.started.set()
        await self.release.wait()
        return self.result


def _execution_service(session_factory, gateway, *, clock=lambda: NOW):
    return ExecuteSiscaValidationCheck(
        unit_of_work=SqlAlchemySiscaValidationUnitOfWork(session_factory),
        gateway=gateway,
        known_movement_types=frozenset({"Traspaso NAP", "Registro NAP"}),
        allowed_movement_types=frozenset({"Traspaso NAP", "Registro NAP"}),
        minimum_transfer_date=None,
        max_retries=0,
        clock=clock,
    )


async def _register(session_factory, *, registered_at=NOW - timedelta(hours=24)):
    return await RegisterCustomerForSiscaValidation(
        SqlAlchemySiscaValidationUnitOfWork(session_factory)
    )(
        RegisterCustomerForValidationCommand(
            rewards_id=f"RWD-{registered_at.timestamp()}",
            curp=CURP,
            nss="0012345678901234",
            name="Ada Lovelace",
            email="ada@example.test",
            phone=None,
            postal_code=None,
            registered_at=registered_at,
        )
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_registration_persists_customer_and_schedule_atomically(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    result = await _register(postgres_session_factory)

    async with postgres_session_factory() as session:
        customer = await session.get(CustomerModel, result.customer_id)
        validation = await session.get(SiscaValidationModel, result.validation_id)

    assert customer is not None
    assert customer.customer_status == "PENDING_VALIDATION"
    assert validation is not None
    assert validation.status == "PENDING"
    assert validation.h24_due_at == NOW
    assert validation.d3_due_at == NOW + timedelta(hours=48)
    assert validation.d5_due_at == NOW + timedelta(hours=96)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_replayed_checkpoint_creates_one_check_and_one_gateway_call(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    registered = await _register(postgres_session_factory)
    gateway = CountingGateway(SiscaNoInformation())
    service = _execution_service(postgres_session_factory, gateway)
    command = ExecuteValidationCheckCommand(registered.validation_id, ValidationCheckpoint.H24)

    first = await service(command)
    replay = await service(command)

    async with postgres_session_factory() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(SiscaValidationCheckModel)
            .where(SiscaValidationCheckModel.validation_id == registered.validation_id)
        )
    assert first.replayed is False
    assert replay.replayed is True
    assert gateway.calls == 1
    assert count == 1


@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_workers_share_database_checkpoint_claim(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    registered = await _register(postgres_session_factory)
    gateway = ControlledGateway(SiscaNoInformation())
    command = ExecuteValidationCheckCommand(registered.validation_id, ValidationCheckpoint.H24)
    first_service = _execution_service(postgres_session_factory, gateway)
    second_service = _execution_service(postgres_session_factory, gateway)

    first_task = asyncio.create_task(first_service(command))
    await asyncio.wait_for(gateway.started.wait(), timeout=5)
    second_task = asyncio.create_task(second_service(command))
    await asyncio.sleep(0.05)
    gateway.release.set()
    first, second = await asyncio.gather(first_task, second_task)

    assert gateway.calls == 1
    assert {first.replayed, second.replayed} == {False, True}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_h24_d3_d5_end_to_end_finishes_cancelled(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    registered_at = NOW - timedelta(hours=120)
    registered = await _register(postgres_session_factory, registered_at=registered_at)
    gateway = CountingGateway(SiscaNoInformation())

    h24 = await _execution_service(
        postgres_session_factory,
        gateway,
        clock=lambda: registered_at + timedelta(hours=24),
    )(ExecuteValidationCheckCommand(registered.validation_id, ValidationCheckpoint.H24))
    d3 = await _execution_service(
        postgres_session_factory,
        gateway,
        clock=lambda: registered_at + timedelta(hours=72),
    )(ExecuteValidationCheckCommand(registered.validation_id, ValidationCheckpoint.D3))
    d5 = await _execution_service(
        postgres_session_factory,
        gateway,
        clock=lambda: registered_at + timedelta(hours=120),
    )(ExecuteValidationCheckCommand(registered.validation_id, ValidationCheckpoint.D5))

    async with postgres_session_factory() as session:
        customer = await session.get(CustomerModel, registered.customer_id)
        validation = await session.get(SiscaValidationModel, registered.validation_id)
    assert h24.status is ValidationStatus.PENDING
    assert d3.status is ValidationStatus.PENDING
    assert d5.status is ValidationStatus.CANCELLED
    assert customer is not None and customer.customer_status == "INACTIVE"
    assert validation is not None and validation.team_notification_required is True


@pytest.mark.integration
@pytest.mark.asyncio
async def test_activation_failure_rolls_back_check_and_customer_transition(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    registered = await _register(postgres_session_factory)
    async with postgres_session_factory() as session:
        await session.execute(delete(ServiceModel).where(ServiceModel.code == "AFORE"))
        await session.commit()
    gateway = CountingGateway(
        FoundSiscaValidation(
            "Traspaso NAP",
            "ACEPTADA PROCESAR",
            date(2026, 7, 2),
        )
    )

    with pytest.raises(AforeServiceNotConfiguredError):
        await _execution_service(postgres_session_factory, gateway)(
            ExecuteValidationCheckCommand(registered.validation_id, ValidationCheckpoint.H24)
        )

    async with postgres_session_factory() as session:
        customer = await session.get(CustomerModel, registered.customer_id)
        validation = await session.get(SiscaValidationModel, registered.validation_id)
        check_count = await session.scalar(
            select(func.count())
            .select_from(SiscaValidationCheckModel)
            .where(SiscaValidationCheckModel.validation_id == registered.validation_id)
        )
    assert customer is not None and customer.customer_status == "PENDING_VALIDATION"
    assert validation is not None and validation.status == "PENDING"
    assert check_count == 0
