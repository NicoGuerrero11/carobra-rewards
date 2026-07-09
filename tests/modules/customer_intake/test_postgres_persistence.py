from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.modules.customer_intake.application.commands import (
    ProcessSimulatedCustomerIntakeCommand,
)
from carobra_rewards.modules.customer_intake.application.results import (
    SimulatedCustomerIntakeStatus,
)
from carobra_rewards.modules.customer_intake.application.service import (
    ProcessSimulatedCustomerIntake,
)
from carobra_rewards.modules.customer_intake.domain.entities import (
    Customer,
    CustomerIntakeRequest,
    CustomerService,
    CustomerServiceStatus,
    CustomerStatus,
    IntakeProcessingStatus,
    OnboardingStatus,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    CustomerIntakeRequestModel,
    CustomerModel,
    CustomerServiceModel,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.repositories import (
    SqlAlchemyCustomerIntakeUnitOfWork,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.timestamps import utc_now


class FixedRewardsIdGenerator:
    def __init__(self, value: str) -> None:
        self._value = value

    def generate(self) -> str:
        return self._value


def _now() -> datetime:
    return datetime.now(UTC)


def _command(
    *,
    external_request_id: str = "external-1",
    curp: str = "ABCD123456HMNLRS09",
    nss: str = "0012345678901234",
    tipo_de_movimiento: str = "Traspaso NAP",
    estatus_sf: str = "ACEPTADA PROCESAR",
    fecha_de_traspaso: str = "2026-07-01",
) -> ProcessSimulatedCustomerIntakeCommand:
    return ProcessSimulatedCustomerIntakeCommand(
        source="SISCA",
        external_request_id=external_request_id,
        curp=curp,
        nss=nss,
        first_name="Ada",
        paternal_last_name="Lovelace",
        maternal_last_name="Byron",
        email="ada@example.com",
        birth_date=date(1990, 5, 17),
        advisor_identifier="advisor-123",
        movement_type=tipo_de_movimiento,
        sf_status=estatus_sf,
        transfer_date=date.fromisoformat(fecha_de_traspaso),
        phone="5551234567",
        postal_code="01010",
        state="CDMX",
        city="Ciudad de Mexico",
        original_payload={
            "external_request_id": external_request_id,
            "curp": curp,
            "nss": nss,
            "nombre": "Ada",
            "apellido_paterno": "Lovelace",
            "apellido_materno": "Byron",
            "correo_electronico": "ada@example.com",
            "fecha_de_nacimiento": "1990-05-17",
            "advisor_identifier": "advisor-123",
            "tipo_de_movimiento": tipo_de_movimiento,
            "estatus_sf": estatus_sf,
            "fecha_de_traspaso": fecha_de_traspaso,
            "celular": "5551234567",
            "codigo_postal": "01010",
            "estado": "CDMX",
            "ciudad": "Ciudad de Mexico",
        },
    )


async def _seed_existing_customer(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    curp: str,
    nss: str,
) -> Customer:
    customer = Customer.create(
        rewards_id="RWD-existing",
        curp=curp,
        nss=nss,
        name="Existing Customer",
        email="existing@example.com",
        phone="5550000000",
        postal_code="99999",
        customer_status=CustomerStatus.PENDING_ONBOARDING,
        onboarding_status=OnboardingStatus.PENDING,
        created_at=_now(),
        updated_at=_now(),
    )
    async with SqlAlchemyCustomerIntakeUnitOfWork(session_factory) as uow:
        service = await uow.services.get_by_code("AFORE")
        assert service is not None
        await uow.customers.create(customer)
        await uow.customer_services.create(
            CustomerService.create(
                customer_id=customer.id,
                service_id=service.id,
                status=CustomerServiceStatus.ACTIVE,
                started_at=_now(),
                ended_at=None,
                created_at=_now(),
                updated_at=_now(),
            )
        )
    return customer


@pytest.mark.integration
@pytest.mark.asyncio
async def test_customer_intake_request_persistence_keeps_source_external_request_id_unique(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    intake = CustomerIntakeRequest.create(
        source="SISCA",
        external_request_id="external-1",
        curp=" abcd123456hmnlrs09 ",
        processing_status=IntakeProcessingStatus.RECEIVED,
        processing_details=None,
        original_payload={"external_request_id": "external-1"},
        customer_id=None,
        received_at=utc_now(),
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    duplicate = CustomerIntakeRequest.create(
        source="SISCA",
        external_request_id="external-1",
        curp="ZXCV123456HMNLRS11",
        processing_status=IntakeProcessingStatus.RECEIVED,
        processing_details=None,
        original_payload={"external_request_id": "external-1"},
        customer_id=None,
        received_at=utc_now(),
        created_at=utc_now(),
        updated_at=utc_now(),
    )

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.intake_requests.save(intake)

    async with postgres_session_factory() as session:
        session.add(
            CustomerIntakeRequestModel(
                id=duplicate.id,
                source=duplicate.source,
                external_request_id=duplicate.external_request_id,
                curp=duplicate.curp.strip().upper(),
                processing_status=duplicate.processing_status.value,
                processing_details=None,
                original_payload=duplicate.original_payload,
                customer_id=None,
                received_at=duplicate.received_at,
                processed_at=None,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_customers_table_enforces_unique_nss(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    first = Customer.create(
        rewards_id="RWD-1",
        curp="ABCD123456HMNLRS09",
        nss="0012345678901234",
        name="First Customer",
        email="first@example.com",
        phone="5551111111",
        postal_code="01010",
        customer_status=CustomerStatus.PENDING_ONBOARDING,
        onboarding_status=OnboardingStatus.PENDING,
        created_at=_now(),
        updated_at=_now(),
    )
    second = Customer.create(
        rewards_id="RWD-2",
        curp="ZXCV123456HMNLRS11",
        nss="0012345678901234",
        name="Second Customer",
        email="second@example.com",
        phone="5552222222",
        postal_code="02020",
        customer_status=CustomerStatus.PENDING_ONBOARDING,
        onboarding_status=OnboardingStatus.PENDING,
        created_at=_now(),
        updated_at=_now(),
    )

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.customers.create(first)

    async with postgres_session_factory() as session:
        session.add(
            CustomerModel(
                id=second.id,
                rewards_id=second.rewards_id,
                curp=second.curp,
                nss=second.nss,
                name=second.name,
                email=second.email,
                phone=second.phone,
                postal_code=second.postal_code,
                customer_status=second.customer_status.value,
                onboarding_status=second.onboarding_status.value,
                created_at=second.created_at,
                updated_at=second.updated_at,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_service_replays_duplicate_request_as_idempotent_duplicate(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    service = ProcessSimulatedCustomerIntake(
        SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory),
        FixedRewardsIdGenerator("RWD-fixed"),
        mvp_start_date=date(2026, 7, 1),
    )
    command = _command(external_request_id="external-fixed")

    created = await service(command)
    replayed = await service(command)

    assert created.status is SimulatedCustomerIntakeStatus.ACCEPTED
    assert replayed.status is SimulatedCustomerIntakeStatus.IDEMPOTENT_DUPLICATE
    assert replayed.replayed is True


@pytest.mark.integration
@pytest.mark.asyncio
async def test_service_reuses_existing_customer_for_duplicate_identity_by_nss(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    existing = await _seed_existing_customer(
        postgres_session_factory,
        curp="ZXCV123456HMNLRS11",
        nss="0012345678901234",
    )
    service = ProcessSimulatedCustomerIntake(
        SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory),
        FixedRewardsIdGenerator("RWD-unused"),
        mvp_start_date=date(2026, 7, 1),
    )

    result = await service(
        _command(
            external_request_id="external-existing-nss",
            curp="ZXCV123456HMNLRS11",
            nss="0012345678901234",
        )
    )

    assert result.status is SimulatedCustomerIntakeStatus.ACCEPTED
    assert result.customer_id == str(existing.id)

    async with postgres_session_factory() as session:
        customer_count = await session.scalar(select(func.count()).select_from(CustomerModel))
        intake_count = await session.scalar(
            select(func.count()).select_from(CustomerIntakeRequestModel)
        )
        relation_count = await session.scalar(
            select(func.count()).select_from(CustomerServiceModel)
        )

    assert customer_count == 1
    assert intake_count == 1
    assert relation_count == 1
