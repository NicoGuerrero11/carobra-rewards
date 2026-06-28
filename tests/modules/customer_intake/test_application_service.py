from __future__ import annotations

from datetime import UTC, datetime

import pytest

from carobra_rewards.api.v1.customer_intake.schemas import (
    CustomerIntakeRequest as CustomerIntakeHttpRequest,
)
from carobra_rewards.modules.customer_intake.application.commands import (
    ProcessSimulatedCustomerIntakeCommand,
)
from carobra_rewards.modules.customer_intake.application.errors import (
    CurpNssConflict,
    CustomerServiceInconsistency,
    ExternalRequestConflict,
    RewardsIdCollisionExhausted,
    SuccessfulIntakeInconsistency,
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
    Service,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.repositories import (
    InMemoryCustomerIntakeRepository,
    InMemoryCustomerIntakeUnitOfWork,
    InMemoryCustomerRepository,
    InMemoryCustomerServiceRepository,
    InMemoryServiceRepository,
)


class StubRewardsIdGenerator:
    def __init__(self, values: list[str]) -> None:
        self._values = values
        self.calls = 0

    def generate(self) -> str:
        value = self._values[self.calls]
        self.calls += 1
        return value


def _now() -> datetime:
    return datetime.now(UTC)


def _make_service(code: str = "AFORE") -> Service:
    now = _now()
    return Service.create(
        code=code,
        name=code,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _make_customer(
    *,
    rewards_id: str,
    curp: str,
    nss: str = "0012345678901234",
    name: str = "Test User",
    email: str = "test@example.com",
    phone: str | None = "5551234567",
    postal_code: str | None = "01010",
) -> Customer:
    now = _now()
    return Customer.create(
        rewards_id=rewards_id,
        curp=curp,
        nss=nss,
        name=name,
        email=email,
        phone=phone,
        postal_code=postal_code,
        customer_status=CustomerStatus.PENDING_ONBOARDING,
        onboarding_status=OnboardingStatus.PENDING,
        created_at=now,
        updated_at=now,
    )


def _make_relation(
    *,
    customer_id,
    service_id,
    status=CustomerServiceStatus.ACTIVE,
) -> CustomerService:
    now = _now()
    return CustomerService.create(
        customer_id=customer_id,
        service_id=service_id,
        status=status,
        started_at=now,
        ended_at=None,
        created_at=now,
        updated_at=now,
    )


def _make_command(
    external_request_id: str = "external-1",
    *,
    nss: str = "0012345678901234",
    name: str = "  Test User  ",
    email: str = "test@example.com",
    phone: str | None = "5551234567",
    postal_code: str | None = "01010",
) -> ProcessSimulatedCustomerIntakeCommand:
    return ProcessSimulatedCustomerIntakeCommand(
        source="SISCA_SIMULATED",
        external_request_id=external_request_id,
        curp="  abcd123456hmnlrs09  ",
        nss=nss,
        name=name,
        email=email,
        phone=phone,
        postal_code=postal_code,
        original_payload={
            "source": "SISCA_SIMULATED",
            "external_request_id": external_request_id,
            "curp": "  abcd123456hmnlrs09  ",
            "nss": nss,
            "name": name,
            "email": email,
            "phone": phone,
            "postal_code": postal_code,
        },
    )


@pytest.mark.asyncio
async def test_processes_new_simulated_intake_and_returns_rewards_id() -> None:
    repository = InMemoryCustomerIntakeRepository()
    services = InMemoryServiceRepository([_make_service()])
    uow = InMemoryCustomerIntakeUnitOfWork(repository=repository, services=services)
    generator = StubRewardsIdGenerator(["RWD-approved"])
    service = ProcessSimulatedCustomerIntake(uow, generator)

    result = await service(_make_command())

    assert result.status is SimulatedCustomerIntakeStatus.APPROVED
    assert result.replayed is False
    assert result.rewards_id == "RWD-approved"
    assert generator.calls == 1

    stored_intake = repository.list_submissions()[0]
    assert stored_intake.processing_status is IntakeProcessingStatus.APPROVED
    assert stored_intake.processing_details is None
    assert stored_intake.processed_at is not None
    assert stored_intake.original_payload["curp"] == "  abcd123456hmnlrs09  "

    stored_customer = await uow.customers.get_by_curp("ABCD123456HMNLRS09")
    assert stored_customer is not None
    assert stored_customer.nss == "0012345678901234"
    assert stored_customer.customer_status is CustomerStatus.PENDING_ONBOARDING
    assert stored_customer.onboarding_status is OnboardingStatus.PENDING

    aforeservice = await uow.services.get_by_code("AFORE")
    assert aforeservice is not None
    relation = await uow.customer_services.get_by_customer_and_service(
        stored_customer.id,
        aforeservice.id,
    )
    assert relation is not None
    assert relation.status is CustomerServiceStatus.ACTIVE


@pytest.mark.asyncio
async def test_replays_approved_intake_idempotently() -> None:
    services = InMemoryServiceRepository([_make_service()])
    repository = InMemoryCustomerIntakeRepository()
    uow = InMemoryCustomerIntakeUnitOfWork(repository=repository, services=services)
    generator = StubRewardsIdGenerator(["RWD-approved"])
    service = ProcessSimulatedCustomerIntake(uow, generator)
    command = _make_command()

    first = await service(command)
    second = await service(command)

    assert first.intake_request_id == second.intake_request_id
    assert first.customer_id == second.customer_id
    assert second.replayed is True
    assert second.status is SimulatedCustomerIntakeStatus.APPROVED
    assert generator.calls == 1
    assert len(repository.list_submissions()) == 1


@pytest.mark.asyncio
async def test_returns_already_active_for_existing_customer_with_active_afore() -> None:
    aforeservice = _make_service()
    customer = _make_customer(rewards_id="RWD-existing", curp="ABCD123456HMNLRS09")
    customers = InMemoryCustomerRepository()
    customer_services = InMemoryCustomerServiceRepository()
    async_uow = InMemoryCustomerIntakeUnitOfWork(
        repository=InMemoryCustomerIntakeRepository(),
        customers=customers,
        services=InMemoryServiceRepository([aforeservice]),
        customer_services=customer_services,
    )
    async with async_uow:
        await async_uow.customers.create(customer)
        await async_uow.customer_services.create(
            _make_relation(customer_id=customer.id, service_id=aforeservice.id)
        )

    service = ProcessSimulatedCustomerIntake(
        async_uow,
        StubRewardsIdGenerator(["RWD-unused"]),
    )

    result = await service(_make_command())

    assert result.status is SimulatedCustomerIntakeStatus.ALREADY_ACTIVE
    assert result.replayed is False
    assert result.rewards_id == "RWD-existing"
    stored_intake = async_uow.intake_requests.list_submissions()[0]
    assert stored_intake.processing_status is IntakeProcessingStatus.ALREADY_ACTIVE


@pytest.mark.asyncio
async def test_returns_already_active_for_same_nss_with_combined_contact_differences() -> None:
    aforeservice = _make_service()
    customer = _make_customer(
        rewards_id="RWD-existing",
        curp="ABCD123456HMNLRS09",
        name="Existing User",
        email="existing@example.com",
        phone="5550000000",
        postal_code="99999",
    )
    customers = InMemoryCustomerRepository()
    customer_services = InMemoryCustomerServiceRepository()
    async_uow = InMemoryCustomerIntakeUnitOfWork(
        repository=InMemoryCustomerIntakeRepository(),
        customers=customers,
        services=InMemoryServiceRepository([aforeservice]),
        customer_services=customer_services,
    )
    async with async_uow:
        await async_uow.customers.create(customer)
        await async_uow.customer_services.create(
            _make_relation(customer_id=customer.id, service_id=aforeservice.id)
        )

    service = ProcessSimulatedCustomerIntake(
        async_uow,
        StubRewardsIdGenerator(["RWD-unused"]),
    )

    result = await service(
        _make_command(
            "external-contact-diff",
            name="  Changed Name  ",
            email="changed@example.com",
            phone="5551234567",
            postal_code="01010",
        )
    )

    assert result.status is SimulatedCustomerIntakeStatus.ALREADY_ACTIVE
    assert result.rewards_id == "RWD-existing"
    stored_customer = await async_uow.customers.get_by_id(customer.id)
    assert stored_customer == customer

    stored_intake = async_uow.intake_requests.list_submissions()[0]
    assert stored_intake.processing_status is IntakeProcessingStatus.ALREADY_ACTIVE
    assert stored_intake.original_payload == {
        "source": "SISCA_SIMULATED",
        "external_request_id": "external-contact-diff",
        "curp": "  abcd123456hmnlrs09  ",
        "nss": "0012345678901234",
        "name": "  Changed Name  ",
        "email": "changed@example.com",
        "phone": "5551234567",
        "postal_code": "01010",
    }


@pytest.mark.asyncio
async def test_schema_and_application_trim_only_nss_preserves_leading_zeroes_for_already_active(
) -> None:
    aforeservice = _make_service()
    customer = _make_customer(
        rewards_id="RWD-existing",
        curp="ABCD123456HMNLRS09",
        nss="00123456789",
        name="Existing User",
        email="existing@example.com",
        phone="5550000000",
        postal_code="99999",
    )
    customers = InMemoryCustomerRepository()
    customer_services = InMemoryCustomerServiceRepository()
    repository = InMemoryCustomerIntakeRepository()
    async_uow = InMemoryCustomerIntakeUnitOfWork(
        repository=repository,
        customers=customers,
        services=InMemoryServiceRepository([aforeservice]),
        customer_services=customer_services,
    )
    async with async_uow:
        await async_uow.customers.create(customer)
        await async_uow.customer_services.create(
            _make_relation(customer_id=customer.id, service_id=aforeservice.id)
        )

    request = CustomerIntakeHttpRequest(
        source="SISCA_SIMULATED",
        external_request_id="external-trimmed-nss",
        curp="  abcd123456hmnlrs09  ",
        nss="  00123456789  ",
        name=" Changed Name ",
        email="changed@example.com",
        phone="5551234567",
        postal_code="01010",
    )
    command = request.to_command()
    service = ProcessSimulatedCustomerIntake(
        async_uow,
        StubRewardsIdGenerator(["RWD-unused"]),
    )

    assert command.nss == "00123456789"
    assert isinstance(command.nss, str)

    result = await service(command)

    assert result.status is SimulatedCustomerIntakeStatus.ALREADY_ACTIVE
    assert result.replayed is False
    assert result.rewards_id == "RWD-existing"

    stored_customer = await async_uow.customers.get_by_id(customer.id)
    assert stored_customer == customer
    assert stored_customer is not None
    assert stored_customer.nss == "00123456789"

    stored_intake = repository.list_submissions()[0]
    assert stored_intake.processing_status is IntakeProcessingStatus.ALREADY_ACTIVE
    assert stored_intake.processing_details is None
    assert stored_intake.original_payload == {
        "source": "SISCA_SIMULATED",
        "external_request_id": "external-trimmed-nss",
        "curp": "  abcd123456hmnlrs09  ",
        "nss": "  00123456789  ",
        "name": " Changed Name ",
        "email": "changed@example.com",
        "phone": "5551234567",
        "postal_code": "01010",
    }


@pytest.mark.asyncio
async def test_persists_identity_conflict_and_commits_before_raising_409_equivalent() -> None:
    aforeservice = _make_service()
    customer = _make_customer(
        rewards_id="RWD-existing",
        curp="ABCD123456HMNLRS09",
        nss="0012345678901234",
    )
    repository = InMemoryCustomerIntakeRepository()
    customers = InMemoryCustomerRepository()
    customer_services = InMemoryCustomerServiceRepository()
    uow = InMemoryCustomerIntakeUnitOfWork(
        repository=repository,
        customers=customers,
        services=InMemoryServiceRepository([aforeservice]),
        customer_services=customer_services,
    )
    async with uow:
        await uow.customers.create(customer)
        await uow.customer_services.create(
            _make_relation(customer_id=customer.id, service_id=aforeservice.id)
        )

    service = ProcessSimulatedCustomerIntake(uow, StubRewardsIdGenerator(["RWD-unused"]))

    with pytest.raises(CurpNssConflict):
        await service(_make_command("external-conflict", nss="0000000000000001"))

    assert uow.committed is True
    assert uow.rolled_back is False
    stored_intake = repository.list_submissions()[0]
    assert stored_intake.customer_id == customer.id
    assert stored_intake.processing_status is IntakeProcessingStatus.IDENTITY_CONFLICT
    assert stored_intake.processing_details == {"reason": "curp_nss_conflict"}
    assert stored_intake.processed_at is not None
    assert stored_intake.original_payload["nss"] == "0000000000000001"
    stored_customer = await uow.customers.get_by_id(customer.id)
    assert stored_customer == customer


@pytest.mark.asyncio
async def test_replays_identity_conflict_without_creating_duplicate_intake() -> None:
    aforeservice = _make_service()
    customer = _make_customer(rewards_id="RWD-existing", curp="ABCD123456HMNLRS09")
    repository = InMemoryCustomerIntakeRepository()
    uow = InMemoryCustomerIntakeUnitOfWork(
        repository=repository,
        customers=InMemoryCustomerRepository(),
        services=InMemoryServiceRepository([aforeservice]),
        customer_services=InMemoryCustomerServiceRepository(),
    )
    async with uow:
        await uow.customers.create(customer)
        await uow.customer_services.create(
            _make_relation(customer_id=customer.id, service_id=aforeservice.id)
        )

    service = ProcessSimulatedCustomerIntake(uow, StubRewardsIdGenerator(["RWD-unused"]))
    conflict_command = _make_command("external-conflict-replay", nss="0000000000000001")

    with pytest.raises(CurpNssConflict):
        await service(conflict_command)

    stored_before = repository.list_submissions()[0]

    with pytest.raises(CurpNssConflict):
        await service(_make_command("external-conflict-replay", nss="9999999999999999"))

    stored_after = repository.list_submissions()[0]
    assert len(repository.list_submissions()) == 1
    assert stored_after.id == stored_before.id
    assert stored_after.original_payload == stored_before.original_payload
    assert stored_after.customer_id == stored_before.customer_id
    assert stored_after.processed_at == stored_before.processed_at
    assert stored_after.processing_details == {"reason": "curp_nss_conflict"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "relation_status",
    [None, CustomerServiceStatus.INACTIVE, CustomerServiceStatus.ENDED],
)
async def test_fails_when_existing_customer_lacks_active_afore_relation(
    relation_status: CustomerServiceStatus | None,
) -> None:
    customer = _make_customer(rewards_id="RWD-existing", curp="ABCD123456HMNLRS09")
    uow = InMemoryCustomerIntakeUnitOfWork(
        customers=InMemoryCustomerRepository(),
        services=InMemoryServiceRepository([_make_service()]),
        customer_services=InMemoryCustomerServiceRepository(),
    )
    async with uow:
        await uow.customers.create(customer)
        if relation_status is not None:
            service = await uow.services.get_by_code("AFORE")
            assert service is not None
            await uow.customer_services.create(
                _make_relation(
                    customer_id=customer.id,
                    service_id=service.id,
                    status=relation_status,
                )
            )

    service = ProcessSimulatedCustomerIntake(uow, StubRewardsIdGenerator(["RWD-unused"]))

    with pytest.raises(CustomerServiceInconsistency):
        await service(_make_command(nss="9999999999999999"))

    assert len(uow.intake_requests.list_submissions()) == 0


@pytest.mark.asyncio
async def test_retries_rewards_id_collision_and_then_succeeds() -> None:
    existing_customer = _make_customer(rewards_id="RWD-collision", curp="QWER123456HMNLRS10")
    customers = InMemoryCustomerRepository()
    uow = InMemoryCustomerIntakeUnitOfWork(
        customers=customers,
        services=InMemoryServiceRepository([_make_service()]),
    )
    async with uow:
        await uow.customers.create(existing_customer)

    generator = StubRewardsIdGenerator(["RWD-collision", "RWD-final"])
    service = ProcessSimulatedCustomerIntake(uow, generator)

    result = await service(_make_command())

    assert result.status is SimulatedCustomerIntakeStatus.APPROVED
    assert result.rewards_id == "RWD-final"
    assert generator.calls == 2


@pytest.mark.asyncio
async def test_fails_after_exhausting_rewards_id_collisions() -> None:
    customers = InMemoryCustomerRepository()
    uow = InMemoryCustomerIntakeUnitOfWork(
        customers=customers,
        services=InMemoryServiceRepository([_make_service()]),
    )
    async with uow:
        for index, curp in enumerate(
            ["QWER123456HMNLRS10", "ZXCV123456HMNLRS11", "ASDF123456HMNLRS12"],
            start=1,
        ):
            await uow.customers.create(
                _make_customer(rewards_id=f"RWD-{index}", curp=curp)
            )

    service = ProcessSimulatedCustomerIntake(
        uow,
        StubRewardsIdGenerator(["RWD-1", "RWD-2", "RWD-3"]),
    )

    with pytest.raises(RewardsIdCollisionExhausted):
        await service(_make_command())

    assert len(uow.intake_requests.list_submissions()) == 0


@pytest.mark.asyncio
async def test_conflicts_when_external_request_exists_in_non_replayable_state() -> None:
    repository = InMemoryCustomerIntakeRepository()
    now = _now()
    intake = CustomerIntakeRequest.create(
        source="SISCA_SIMULATED",
        external_request_id="external-1",
        curp="ABCD123456HMNLRS09",
        processing_status=IntakeProcessingStatus.PROCESSING,
        processing_details={"step": "processing"},
        original_payload={"external_request_id": "external-1"},
        customer_id=None,
        received_at=now,
        created_at=now,
        updated_at=now,
    )
    async with InMemoryCustomerIntakeUnitOfWork(repository=repository) as uow:
        await uow.intake_requests.save(intake)

    service = ProcessSimulatedCustomerIntake(
        InMemoryCustomerIntakeUnitOfWork(
            repository=repository,
            services=InMemoryServiceRepository([_make_service()]),
        ),
        StubRewardsIdGenerator(["RWD-unused"]),
    )

    with pytest.raises(ExternalRequestConflict):
        await service(_make_command())


@pytest.mark.asyncio
async def test_fails_when_successful_replay_cannot_recover_customer() -> None:
    repository = InMemoryCustomerIntakeRepository()
    now = _now()
    intake = CustomerIntakeRequest.create(
        source="SISCA_SIMULATED",
        external_request_id="external-1",
        curp="ABCD123456HMNLRS09",
        processing_status=IntakeProcessingStatus.APPROVED,
        processing_details=None,
        original_payload={"external_request_id": "external-1"},
        customer_id=None,
        received_at=now,
        processed_at=now,
        created_at=now,
        updated_at=now,
    )
    async with InMemoryCustomerIntakeUnitOfWork(repository=repository) as uow:
        await uow.intake_requests.save(intake)

    service = ProcessSimulatedCustomerIntake(
        InMemoryCustomerIntakeUnitOfWork(
            repository=repository,
            services=InMemoryServiceRepository([_make_service()]),
        ),
        StubRewardsIdGenerator(["RWD-unused"]),
    )

    with pytest.raises(SuccessfulIntakeInconsistency):
        await service(_make_command())
