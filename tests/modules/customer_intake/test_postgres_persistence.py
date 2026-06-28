from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from tests.modules.customer_intake.integration_support import (
    AsyncBarrier,
    BlockingCustomerRepository,
    BlockingIntakeRequestRepository,
    FailingAfterAssociateCustomerRepository,
    FailingAfterCustomerCreateRepository,
    FailingAfterCustomerServiceCreateRepository,
    FailingAfterIntakeSaveRepository,
    HookedSqlAlchemyCustomerIntakeUnitOfWork,
    InjectedFailureError,
    RepositoryHooks,
    SequenceRewardsIdGenerator,
)

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
from carobra_rewards.modules.customer_intake.domain.errors import (
    DuplicateCustomerCurpError,
    DuplicateCustomerRewardsIdError,
    DuplicateCustomerServiceError,
    DuplicateExternalRequestError,
    IntakeCustomerReassignmentError,
    IntakeRequestNotFoundError,
)
from carobra_rewards.modules.customer_intake.domain.value_objects import JsonObject
from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    CustomerIntakeRequestModel,
    CustomerModel,
    CustomerServiceModel,
    ServiceModel,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.repositories import (
    SqlAlchemyCustomerIntakeUnitOfWork,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.timestamps import (
    utc_now,
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def _make_intake(
    *,
    source: str = "SISCA",
    external_request_id: str = "request-1",
    curp: str = " abcd123456hmnlrs09 ",
    processing_status: IntakeProcessingStatus = IntakeProcessingStatus.RECEIVED,
    processing_details: JsonObject | None = None,
    original_payload: JsonObject | None = None,
) -> CustomerIntakeRequest:
    now = utc_now()
    return CustomerIntakeRequest.create(
        source=source,
        external_request_id=external_request_id,
        curp=curp,
        processing_status=processing_status,
        processing_details=processing_details,
        original_payload=original_payload
        or {
            "curp": curp,
            "source": source,
            "external_request_id": external_request_id,
        },
        customer_id=None,
        received_at=now,
        created_at=now,
        updated_at=now,
    )


def _make_customer(
    *,
    rewards_id: str = "REW-0001",
    curp: str = "abcd123456hmnlrs09",
    nss: str = "0012345678901234",
    name: str = "Test User",
    email: str = "test@example.com",
) -> Customer:
    now = utc_now()
    return Customer.create(
        rewards_id=rewards_id,
        curp=curp,
        nss=nss,
        name=name,
        email=email,
        phone="5551234567",
        postal_code="01010",
        customer_status=CustomerStatus.PENDING_ONBOARDING,
        onboarding_status=OnboardingStatus.PENDING,
        created_at=now,
        updated_at=now,
    )


def _make_customer_service(*, customer_id, service_id) -> CustomerService:
    now = utc_now()
    return CustomerService.create(
        customer_id=customer_id,
        service_id=service_id,
        status=CustomerServiceStatus.ACTIVE,
        started_at=now,
        ended_at=None,
        created_at=now,
        updated_at=now,
    )


async def _fetch_service_id(session_factory: async_sessionmaker[AsyncSession]) -> UUID:
    async with session_factory() as session:
        service = await session.scalar(select(ServiceModel).where(ServiceModel.code == "AFORE"))
        assert service is not None
        return service.id


def _command(
    *,
    external_request_id: str = "external-1",
    curp: str = "  abcd123456hmnlrs09  ",
) -> ProcessSimulatedCustomerIntakeCommand:
    return ProcessSimulatedCustomerIntakeCommand(
        source="SISCA_SIMULATED",
        external_request_id=external_request_id,
        curp=curp,
        nss="0012345678901234",
        name=" Test User ",
        email="test@example.com",
        phone="5551234567",
        postal_code="01010",
        original_payload={
            "source": "SISCA_SIMULATED",
            "external_request_id": external_request_id,
            "curp": curp,
            "nss": "0012345678901234",
            "name": " Test User ",
            "email": "test@example.com",
            "phone": "5551234567",
            "postal_code": "01010",
        },
    )


def _build_service(
    session_factory: async_sessionmaker[AsyncSession],
    generator: SequenceRewardsIdGenerator,
    *,
    hooks: RepositoryHooks | None = None,
) -> ProcessSimulatedCustomerIntake:
    return ProcessSimulatedCustomerIntake(
        HookedSqlAlchemyCustomerIntakeUnitOfWork(session_factory, hooks=hooks),
        generator,
    )


async def _counts(
    session_factory: async_sessionmaker[AsyncSession],
) -> tuple[int, int, int]:
    async with session_factory() as session:
        intake_count = await session.scalar(
            select(func.count()).select_from(CustomerIntakeRequestModel)
        )
        customer_count = await session.scalar(select(func.count()).select_from(CustomerModel))
        relation_count = await session.scalar(
            select(func.count()).select_from(CustomerServiceModel)
        )
    return intake_count or 0, customer_count or 0, relation_count or 0


async def _customer_rewards_ids(
    session_factory: async_sessionmaker[AsyncSession],
) -> list[str]:
    async with session_factory() as session:
        return list(
            (
                await session.execute(
                    select(CustomerModel.rewards_id).order_by(CustomerModel.rewards_id)
                )
            ).scalars()
        )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_persists_intake_without_customer_and_without_creating_customer(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    intake = _make_intake()
    uow = SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory)

    async with uow:
        await uow.intake_requests.save(intake)

    async with postgres_session_factory() as session:
        stored_intake = await session.get(CustomerIntakeRequestModel, intake.id)
        customer_count = await session.scalar(select(func.count()).select_from(CustomerModel))

    assert stored_intake is not None
    assert stored_intake.customer_id is None
    assert stored_intake.processing_status == IntakeProcessingStatus.RECEIVED.value
    assert customer_count == 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rejects_duplicate_source_and_external_request_id(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    first = _make_intake()
    duplicate = _make_intake(curp="ZXCV123456HMNLRS10")
    uow = SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory)

    async with uow:
        await uow.intake_requests.save(first)

    with pytest.raises(DuplicateExternalRequestError):
        async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as duplicate_uow:
            await duplicate_uow.intake_requests.save(duplicate)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_customer_creation_requires_unique_rewards_id_and_curp(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    customer = _make_customer(curp=" abcd123456hmnlrs09 ")
    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.customers.create(customer)

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        stored_by_id = await uow.customers.get_by_id(customer.id)
        stored_by_rewards_id = await uow.customers.get_by_rewards_id(customer.rewards_id)
        stored_by_curp = await uow.customers.get_by_curp("abcd123456hmnlrs09")

    assert stored_by_id is not None
    assert stored_by_rewards_id is not None
    assert stored_by_curp is not None
    assert stored_by_id.curp == "ABCD123456HMNLRS09"
    assert stored_by_id.nss == "0012345678901234"
    assert stored_by_id.customer_status is CustomerStatus.PENDING_ONBOARDING
    assert stored_by_id.onboarding_status is OnboardingStatus.PENDING

    with pytest.raises(DuplicateCustomerRewardsIdError):
        async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
            await uow.customers.create(
                _make_customer(
                    rewards_id=customer.rewards_id,
                    curp="QWER123456HMNLRS11",
                )
            )

    with pytest.raises(DuplicateCustomerCurpError):
        async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
            await uow.customers.create(_make_customer(rewards_id="REW-0002", curp=customer.curp))


@pytest.mark.integration
@pytest.mark.asyncio
async def test_allows_repeated_nss_values(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    first = _make_customer(rewards_id="REW-0001", curp="AAAA123456HMNLRS01", nss="00001234")
    second = _make_customer(rewards_id="REW-0002", curp="BBBB123456HMNLRS02", nss="00001234")

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.customers.create(first)
        await uow.customers.create(second)

    async with postgres_session_factory() as session:
        stored = (
            await session.execute(select(CustomerModel).order_by(CustomerModel.rewards_id))
        ).scalars().all()

    assert [customer.nss for customer in stored] == ["00001234", "00001234"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_preserves_original_payload_while_normalizing_structured_curp(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    intake = _make_intake(
        curp=" abcd123456hmnlrs09 ",
        processing_details={"missing_fields": ["postal_code"]},
        original_payload={"curp": " abcd123456hmnlrs09 ", "raw": True},
    )

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.intake_requests.save(intake)

    async with postgres_session_factory() as session:
        stored = await session.get(CustomerIntakeRequestModel, intake.id)

    assert stored is not None
    assert stored.curp == "ABCD123456HMNLRS09"
    assert stored.original_payload["curp"] == " abcd123456hmnlrs09 "
    assert stored.processing_details == {"missing_fields": ["postal_code"]}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_associates_intake_with_customer_and_blocks_reassignment(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    intake = _make_intake()
    first_customer = _make_customer()
    second_customer = _make_customer(rewards_id="REW-0002", curp="QWER123456HMNLRS11")

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.intake_requests.save(intake)
        await uow.customers.create(first_customer)
        await uow.customers.create(second_customer)
        await uow.intake_requests.associate_customer(intake.id, first_customer.id)

    async with postgres_session_factory() as session:
        stored = await session.get(CustomerIntakeRequestModel, intake.id)

    assert stored is not None
    assert stored.customer_id == first_customer.id

    with pytest.raises(IntakeCustomerReassignmentError):
        async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
            await uow.intake_requests.associate_customer(intake.id, second_customer.id)

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.intake_requests.associate_customer(intake.id, first_customer.id)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_associate_customer_fails_when_intake_does_not_exist(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    customer = _make_customer()

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.customers.create(customer)

    with pytest.raises(IntakeRequestNotFoundError):
        async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
            await uow.intake_requests.associate_customer(
                UUID("00000000-0000-0000-0000-000000000001"),
                customer.id,
            )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_aforeservice_seed_exists_and_customer_service_relations_work(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    customer = _make_customer()
    service_id = await _fetch_service_id(postgres_session_factory)

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        service = await uow.services.get_by_code("AFORE")
        assert service is not None
        assert service.is_active is True
        await uow.customers.create(customer)
        relation = _make_customer_service(customer_id=customer.id, service_id=service.id)
        await uow.customer_services.create(relation)

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        stored = await uow.customer_services.get_by_customer_and_service(customer.id, service_id)

    assert stored is not None
    assert stored.status is CustomerServiceStatus.ACTIVE

    with pytest.raises(DuplicateCustomerServiceError):
        async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
            await uow.customer_services.create(
                _make_customer_service(customer_id=customer.id, service_id=service_id)
            )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_relation_status_updates_do_not_delete_customer_identity(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    customer = _make_customer()
    service_id = await _fetch_service_id(postgres_session_factory)

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.customers.create(customer)
        relation = _make_customer_service(customer_id=customer.id, service_id=service_id)
        await uow.customer_services.create(relation)
        ended_at = utc_now() + timedelta(days=1)
        await uow.customer_services.update_status_and_dates(
            relation.id,
            CustomerServiceStatus.ENDED,
            ended_at=ended_at,
        )

    async with postgres_session_factory() as session:
        stored_customer = await session.get(CustomerModel, customer.id)
        stored_relation = await session.get(CustomerServiceModel, relation.id)

    assert stored_customer is not None
    assert stored_relation is not None
    assert stored_relation.status == CustomerServiceStatus.ENDED.value
    assert stored_relation.ended_at is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_restrictive_foreign_keys_block_destructive_deletes(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    intake = _make_intake()
    customer = _make_customer()
    service_id = await _fetch_service_id(postgres_session_factory)

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.customers.create(customer)
        await uow.intake_requests.save(intake)
        await uow.intake_requests.associate_customer(intake.id, customer.id)
        await uow.customer_services.create(
            _make_customer_service(customer_id=customer.id, service_id=service_id)
        )

    async with postgres_session_factory() as session:
        stored_customer = await session.get(CustomerModel, customer.id)
        stored_service = await session.get(ServiceModel, service_id)
        assert stored_customer is not None
        assert stored_service is not None
        await session.delete(stored_customer)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        await session.delete(stored_service)
        with pytest.raises(IntegrityError):
            await session.commit()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_updated_at_changes_on_persistent_updates(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    intake = _make_intake()

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.intake_requests.save(intake)

    async with postgres_session_factory() as session:
        before = await session.get(CustomerIntakeRequestModel, intake.id)
        assert before is not None
        original_updated_at = before.updated_at

    processed_at = datetime.now(UTC)
    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.intake_requests.update_status(
            intake.id,
            IntakeProcessingStatus.INCOMPLETE,
            {"reasons": ["missing_phone"]},
            processed_at=processed_at,
        )

    async with postgres_session_factory() as session:
        after = await session.get(CustomerIntakeRequestModel, intake.id)

    assert after is not None
    assert after.processing_status == IntakeProcessingStatus.INCOMPLETE.value
    assert after.processed_at == processed_at
    assert after.updated_at > original_updated_at


@pytest.mark.integration
@pytest.mark.asyncio
async def test_update_status_is_idempotent_and_preserves_first_successful_processed_at(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    intake = _make_intake()

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.intake_requests.save(intake)
        first_processed_at = datetime.now(UTC)
        await uow.intake_requests.update_status(
            intake.id,
            IntakeProcessingStatus.APPROVED,
            {"ignored": True},
            processed_at=first_processed_at,
        )

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.intake_requests.update_status(
            intake.id,
            IntakeProcessingStatus.APPROVED,
            {"still_ignored": True},
            processed_at=datetime.now(UTC) + timedelta(days=1),
        )

    async with postgres_session_factory() as session:
        stored = await session.get(CustomerIntakeRequestModel, intake.id)

    assert stored is not None
    assert stored.processing_status == IntakeProcessingStatus.APPROVED.value
    assert stored.processing_details is None
    assert stored.processed_at == first_processed_at


@pytest.mark.integration
@pytest.mark.asyncio
async def test_update_status_fails_when_intake_does_not_exist(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    with pytest.raises(IntakeRequestNotFoundError):
        async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
            await uow.intake_requests.update_status(
                UUID("00000000-0000-0000-0000-000000000001"),
                IntakeProcessingStatus.PROCESSING,
                None,
            )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_simulated_intake_rolls_back_when_failure_happens_after_intake_save(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    service = _build_service(
        postgres_session_factory,
        SequenceRewardsIdGenerator(["RWD-after-intake"]),
        hooks=RepositoryHooks(
            intake_requests=lambda repo: FailingAfterIntakeSaveRepository(repo),
        ),
    )

    with pytest.raises(InjectedFailureError, match="fail_after_intake_save"):
        await service(_command())

    assert await _counts(postgres_session_factory) == (0, 0, 0)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_simulated_intake_rolls_back_when_failure_happens_after_customer_create(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    service = _build_service(
        postgres_session_factory,
        SequenceRewardsIdGenerator(["RWD-after-customer"]),
        hooks=RepositoryHooks(
            customers=lambda repo: FailingAfterCustomerCreateRepository(repo),
        ),
    )

    with pytest.raises(InjectedFailureError, match="fail_after_customer_create"):
        await service(_command())

    assert await _counts(postgres_session_factory) == (0, 0, 0)
    assert await _customer_rewards_ids(postgres_session_factory) == []


@pytest.mark.integration
@pytest.mark.asyncio
async def test_simulated_intake_rolls_back_when_failure_happens_after_customer_service_create(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    service = _build_service(
        postgres_session_factory,
        SequenceRewardsIdGenerator(["RWD-after-relation"]),
        hooks=RepositoryHooks(
            customer_services=lambda repo: FailingAfterCustomerServiceCreateRepository(repo),
        ),
    )

    with pytest.raises(InjectedFailureError, match="fail_after_customer_service_create"):
        await service(_command())

    assert await _counts(postgres_session_factory) == (0, 0, 0)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_simulated_intake_rolls_back_when_failure_happens_during_finalization(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    service = _build_service(
        postgres_session_factory,
        SequenceRewardsIdGenerator(["RWD-after-associate"]),
        hooks=RepositoryHooks(
            intake_requests=lambda repo: FailingAfterAssociateCustomerRepository(repo),
        ),
    )

    with pytest.raises(InjectedFailureError, match="fail_after_associate_customer"):
        await service(_command())

    assert await _counts(postgres_session_factory) == (0, 0, 0)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_simulated_intake_resolves_concurrent_duplicate_external_request_with_single_identity(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    barrier = AsyncBarrier(2)
    hooks = RepositoryHooks(
        intake_requests=lambda repo: BlockingIntakeRequestRepository(repo, barrier=barrier),
    )
    generator = SequenceRewardsIdGenerator(["RWD-race-1", "RWD-race-2"])
    first_service = _build_service(postgres_session_factory, generator, hooks=hooks)
    second_service = _build_service(postgres_session_factory, generator, hooks=hooks)
    command = _command(external_request_id="external-race")

    first_result, second_result = await asyncio.gather(
        first_service(command),
        second_service(command),
    )

    results = sorted((first_result, second_result), key=lambda result: result.replayed)
    created, replayed = results
    assert created.status is SimulatedCustomerIntakeStatus.APPROVED
    assert created.replayed is False
    assert replayed.status is SimulatedCustomerIntakeStatus.APPROVED
    assert replayed.replayed is True
    assert created.intake_request_id == replayed.intake_request_id
    assert created.customer_id == replayed.customer_id
    assert created.rewards_id == replayed.rewards_id
    assert await _counts(postgres_session_factory) == (1, 1, 1)
    assert await _customer_rewards_ids(postgres_session_factory) == [created.rewards_id]

    async with postgres_session_factory() as session:
        stored_intakes = (
            await session.execute(
                select(CustomerIntakeRequestModel).where(
                    CustomerIntakeRequestModel.source == "SISCA_SIMULATED",
                    CustomerIntakeRequestModel.external_request_id == "external-race",
                )
            )
        ).scalars().all()
        stored_customers = (await session.execute(select(CustomerModel))).scalars().all()
        stored_relations = (await session.execute(select(CustomerServiceModel))).scalars().all()

    assert len(stored_intakes) == 1
    assert len(stored_customers) == 1
    assert len(stored_relations) == 1
    assert stored_intakes[0].customer_id == stored_customers[0].id
    assert stored_intakes[0].processing_status == IntakeProcessingStatus.APPROVED.value


@pytest.mark.integration
@pytest.mark.asyncio
async def test_simulated_intake_resolves_concurrent_duplicate_curp_with_single_customer_identity(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    barrier = AsyncBarrier(2)
    hooks = RepositoryHooks(
        customers=lambda repo: BlockingCustomerRepository(repo, barrier=barrier),
    )
    generator = SequenceRewardsIdGenerator(["RWD-curp-1", "RWD-curp-2"])
    first_service = _build_service(postgres_session_factory, generator, hooks=hooks)
    second_service = _build_service(postgres_session_factory, generator, hooks=hooks)

    first_result, second_result = await asyncio.gather(
        first_service(_command(external_request_id="external-curp-a")),
        second_service(_command(external_request_id="external-curp-b")),
    )

    assert {first_result.status, second_result.status} == {
        SimulatedCustomerIntakeStatus.APPROVED,
        SimulatedCustomerIntakeStatus.ALREADY_ACTIVE,
    }
    assert first_result.replayed is False
    assert second_result.replayed is False
    assert first_result.customer_id == second_result.customer_id
    assert first_result.rewards_id == second_result.rewards_id
    assert await _counts(postgres_session_factory) == (2, 1, 1)
    assert await _customer_rewards_ids(postgres_session_factory) == [first_result.rewards_id]

    async with postgres_session_factory() as session:
        stored_intakes = (
            await session.execute(
                select(CustomerIntakeRequestModel).order_by(
                    CustomerIntakeRequestModel.external_request_id
                )
            )
        ).scalars().all()
        stored_customers = (await session.execute(select(CustomerModel))).scalars().all()
        stored_relations = (await session.execute(select(CustomerServiceModel))).scalars().all()

    assert len(stored_intakes) == 2
    assert len(stored_customers) == 1
    assert len(stored_relations) == 1
    assert {intake.processing_status for intake in stored_intakes} == {
        IntakeProcessingStatus.APPROVED.value,
        IntakeProcessingStatus.ALREADY_ACTIVE.value,
    }
    assert {intake.customer_id for intake in stored_intakes} == {stored_customers[0].id}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_unit_of_work_commit_and_rollback_behavior(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    committed_customer = _make_customer()
    rolled_back_customer = _make_customer(rewards_id="REW-ROLLBACK", curp="ROLL123456HMNLRS1")

    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        await uow.customers.create(committed_customer)

    rollback_uow = SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory)
    await rollback_uow.__aenter__()
    try:
        await rollback_uow.customers.create(rolled_back_customer)
        await rollback_uow.rollback()
    finally:
        await rollback_uow.__aexit__(None, None, None)

    async with postgres_session_factory() as session:
        persisted = await session.get(CustomerModel, committed_customer.id)
        rolled_back = await session.get(CustomerModel, rolled_back_customer.id)

    assert persisted is not None
    assert rolled_back is None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_alembic_upgrade_exposes_postgresql_specific_schema(
    postgres_engine: AsyncEngine,
    migrated_postgres_database: str,
) -> None:
    assert migrated_postgres_database.startswith("postgresql")

    async with postgres_engine.connect() as connection:
        tables = await connection.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
        intake_columns = await connection.run_sync(
            lambda sync_conn: inspect(sync_conn).get_columns("customer_intake_requests")
        )
        intake_indexes = await connection.run_sync(
            lambda sync_conn: inspect(sync_conn).get_indexes("customer_intake_requests")
        )
        customer_unique_constraints = await connection.run_sync(
            lambda sync_conn: inspect(sync_conn).get_unique_constraints("customers")
        )
        service_rows = (
            await connection.execute(text("SELECT code FROM services ORDER BY code"))
        ).scalars().all()

    assert {
        "customer_intake_requests",
        "customers",
        "services",
        "customer_services",
    } <= set(tables)
    assert any(
        column["name"] == "processing_details"
        and column["type"].__class__.__name__ == "JSONB"
        for column in intake_columns
    )
    assert any(
        column["name"] == "id" and "UUID" in str(column["type"]).upper()
        for column in intake_columns
    )
    assert any(
        column["name"] == "received_at" and "TIMEZONE" in repr(column["type"]).upper()
        for column in intake_columns
    )
    assert {
        "ix_intake_customer_id",
        "ix_intake_processing_status",
    } <= {index["name"] for index in intake_indexes}
    assert {constraint["name"] for constraint in customer_unique_constraints} == {
        "uq_customers_curp",
        "uq_customers_rewards_id",
    }
    assert service_rows == ["AFORE"]


@pytest.mark.integration
def test_alembic_downgrade_removes_seed_and_tables(postgres_database_url: str) -> None:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", postgres_database_url)

    async def get_tables() -> list[str]:
        engine = create_async_engine(postgres_database_url, pool_pre_ping=True)
        try:
            async with engine.connect() as connection:
                return list(
                    await connection.run_sync(
                        lambda sync_conn: inspect(sync_conn).get_table_names()
                    )
                )
        finally:
            await engine.dispose()

    async def get_service_codes() -> list[str]:
        engine = create_async_engine(postgres_database_url, pool_pre_ping=True)
        try:
            async with engine.connect() as connection:
                return list(
                    (
                        await connection.execute(
                            text("SELECT code FROM services ORDER BY code")
                        )
                    ).scalars()
                )
        finally:
            await engine.dispose()

    command.downgrade(config, "base")
    command.upgrade(config, "head")
    assert asyncio.run(get_service_codes()) == ["AFORE"]

    command.downgrade(config, "base")
    tables_after_downgrade = asyncio.run(get_tables())

    assert "customers" not in tables_after_downgrade
    assert "services" not in tables_after_downgrade
    assert "customer_intake_requests" not in tables_after_downgrade
    assert "customer_services" not in tables_after_downgrade
