from __future__ import annotations

from datetime import date

import pytest

from carobra_rewards.api.v1.customer_intake.schemas import CustomerIntakeRequest
from carobra_rewards.modules.customer_intake.application.errors import (
    CurpNssConflict,
    MvpStartDateNotConfigured,
)
from carobra_rewards.modules.customer_intake.application.results import (
    SimulatedCustomerIntakeStatus,
)
from carobra_rewards.modules.customer_intake.application.service import (
    ProcessSimulatedCustomerIntake,
)
from carobra_rewards.modules.customer_intake.domain.entities import (
    Customer,
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
from carobra_rewards.modules.customer_intake.infrastructure.persistence.timestamps import utc_now


class StubRewardsIdGenerator:
    def __init__(self, values: list[str]) -> None:
        self._values = values
        self.calls = 0

    def generate(self) -> str:
        value = self._values[self.calls]
        self.calls += 1
        return value


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "external_request_id": "external-1",
        "curp": "  abcd123456hmnlrs09  ",
        "nss": "0012345678901234",
        "nombre": "Ada",
        "apellido_paterno": "Lovelace",
        "apellido_materno": "Byron",
        "correo_electronico": "ada@example.com",
        "fecha_de_nacimiento": "1990-05-17",
        "advisor_identifier": "advisor-123",
        "tipo_de_movimiento": "Traspaso NAP",
        "estatus_sf": "ACEPTADA PROCESAR",
        "fecha_de_traspaso": "2026-07-01",
        "celular": "5551234567",
        "codigo_postal": "01010",
        "estado": "CDMX",
        "ciudad": "Ciudad de Mexico",
    }
    payload.update(overrides)
    return payload


def _request(**overrides: object) -> CustomerIntakeRequest:
    return CustomerIntakeRequest.model_validate(_payload(**overrides))


def _service(
    *,
    repository: InMemoryCustomerIntakeRepository | None = None,
    customers: InMemoryCustomerRepository | None = None,
    customer_services: InMemoryCustomerServiceRepository | None = None,
    mvp_start_date: date | None = date(2026, 7, 1),
    service_entity: Service | None = None,
) -> ProcessSimulatedCustomerIntake:
    service = service_entity or Service.create(
        code="AFORE",
        name="AFORE",
        is_active=True,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    uow = InMemoryCustomerIntakeUnitOfWork(
        repository=repository or InMemoryCustomerIntakeRepository(),
        customers=customers or InMemoryCustomerRepository(),
        services=InMemoryServiceRepository([service]),
        customer_services=customer_services or InMemoryCustomerServiceRepository(),
    )
    return ProcessSimulatedCustomerIntake(
        uow,
        StubRewardsIdGenerator(["RWD-accepted"]),
        mvp_start_date=mvp_start_date,
    )


def _existing_customer(curp: str = "ABCD123456HMNLRS09", nss: str = "0012345678901234") -> Customer:
    now = utc_now()
    return Customer.create(
        rewards_id="RWD-existing",
        curp=curp,
        nss=nss,
        name="Existing Customer",
        email="existing@example.com",
        phone="5550000000",
        postal_code="99999",
        customer_status=CustomerStatus.PENDING_ONBOARDING,
        onboarding_status=OnboardingStatus.PENDING,
        created_at=now,
        updated_at=now,
    )


async def _seed_existing_identity(
    customers: InMemoryCustomerRepository,
    customer_services: InMemoryCustomerServiceRepository,
) -> tuple[Customer, Service]:
    customer = _existing_customer()
    service = Service.create(
        code="AFORE",
        name="AFORE",
        is_active=True,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    relation = CustomerService.create(
        customer_id=customer.id,
        service_id=service.id,
        status=CustomerServiceStatus.ACTIVE,
        started_at=utc_now(),
        ended_at=None,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    await customers.create(customer)
    await customer_services.create(relation)
    return customer, service


@pytest.mark.asyncio
async def test_accepts_valid_payload_and_creates_internal_customer_data() -> None:
    repository = InMemoryCustomerIntakeRepository()
    service = _service(repository=repository)

    result = await service(_request().to_command())

    assert result.status is SimulatedCustomerIntakeStatus.ACCEPTED
    assert result.replayed is False
    assert result.customer_id is not None
    assert result.rewards_id == "RWD-accepted"
    stored_intake = repository.list_submissions()[0]
    assert stored_intake.processing_status is IntakeProcessingStatus.ACCEPTED
    assert "source" not in stored_intake.original_payload
    assert "password" not in stored_intake.original_payload
    assert "terms_accepted_at" not in stored_intake.original_payload


@pytest.mark.asyncio
async def test_optional_fields_can_be_absent() -> None:
    service = _service()

    result = await service(
        _request(celular=None, codigo_postal=None, estado=None, ciudad=None).to_command()
    )

    assert result.status is SimulatedCustomerIntakeStatus.ACCEPTED


@pytest.mark.asyncio
async def test_invalid_movement_type_is_not_eligible() -> None:
    repository = InMemoryCustomerIntakeRepository()
    service = _service(repository=repository)

    result = await service(_request(tipo_de_movimiento="Cambio").to_command())

    assert result.status is SimulatedCustomerIntakeStatus.NOT_ELIGIBLE
    stored_intake = repository.list_submissions()[0]
    assert stored_intake.processing_status is IntakeProcessingStatus.NOT_ELIGIBLE
    assert stored_intake.processing_details == {"reason": "invalid_movement_type"}


@pytest.mark.asyncio
async def test_aceptada_operaciones_is_not_eligible() -> None:
    repository = InMemoryCustomerIntakeRepository()
    service = _service(repository=repository)

    result = await service(_request(estatus_sf="ACEPTADA OPERACIONES").to_command())

    assert result.status is SimulatedCustomerIntakeStatus.NOT_ELIGIBLE
    assert repository.list_submissions()[0].processing_details == {"reason": "invalid_sf_status"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sf_status", "label"),
    [
        ("RECHAZADA", "rejected"),
        ("CANCELADA", "canceled"),
        ("EN PROCESO", "in-process"),
    ],
)
async def test_named_non_eligible_statuses_fall_back_to_invalid_sf_status(
    sf_status: str,
    label: str,
) -> None:
    repository = InMemoryCustomerIntakeRepository()
    service = _service(repository=repository)

    result = await service(_request(estatus_sf=sf_status).to_command())

    assert result.status is SimulatedCustomerIntakeStatus.NOT_ELIGIBLE, label
    assert repository.list_submissions()[0].processing_details == {"reason": "invalid_sf_status"}


@pytest.mark.asyncio
async def test_transfer_date_before_mvp_is_not_eligible() -> None:
    repository = InMemoryCustomerIntakeRepository()
    service = _service(repository=repository)

    result = await service(_request(fecha_de_traspaso="2026-06-30").to_command())

    assert result.status is SimulatedCustomerIntakeStatus.NOT_ELIGIBLE
    assert repository.list_submissions()[0].processing_details == {
        "reason": "pre_mvp_transfer_date"
    }


@pytest.mark.asyncio
async def test_missing_mvp_start_date_fails_in_controlled_way() -> None:
    service = _service(mvp_start_date=None)

    with pytest.raises(MvpStartDateNotConfigured):
        await service(_request().to_command())


@pytest.mark.asyncio
async def test_duplicate_request_returns_idempotent_duplicate() -> None:
    repository = InMemoryCustomerIntakeRepository()
    service = _service(repository=repository)
    command = _request().to_command()

    first = await service(command)
    replay = await service(command)

    assert first.status is SimulatedCustomerIntakeStatus.ACCEPTED
    assert replay.status is SimulatedCustomerIntakeStatus.IDEMPOTENT_DUPLICATE
    assert replay.replayed is True
    assert len(repository.list_submissions()) == 1


@pytest.mark.asyncio
async def test_duplicate_customer_by_curp_reuses_existing_customer_without_duplication() -> None:
    customers = InMemoryCustomerRepository()
    customer_services = InMemoryCustomerServiceRepository()
    existing, service_entity = await _seed_existing_identity(customers, customer_services)
    service = _service(
        customers=customers,
        customer_services=customer_services,
        service_entity=service_entity,
    )

    result = await service(_request(external_request_id="external-2").to_command())

    assert result.status is SimulatedCustomerIntakeStatus.ACCEPTED
    assert result.rewards_id == existing.rewards_id
    assert result.customer_id == str(existing.id)


@pytest.mark.asyncio
async def test_duplicate_customer_by_nss_reuses_existing_customer_without_duplication() -> None:
    customers = InMemoryCustomerRepository()
    customer_services = InMemoryCustomerServiceRepository()
    existing = _existing_customer(curp="ZXCV123456HMNLRS11")
    service_entity = Service.create(
        code="AFORE",
        name="AFORE",
        is_active=True,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    await customers.create(existing)
    await customer_services.create(
        CustomerService.create(
            customer_id=existing.id,
            service_id=service_entity.id,
            status=CustomerServiceStatus.ACTIVE,
            started_at=utc_now(),
            ended_at=None,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
    )
    service = ProcessSimulatedCustomerIntake(
        InMemoryCustomerIntakeUnitOfWork(
            repository=InMemoryCustomerIntakeRepository(),
            customers=customers,
            services=InMemoryServiceRepository([service_entity]),
            customer_services=customer_services,
        ),
        StubRewardsIdGenerator(["RWD-unused"]),
        mvp_start_date=date(2026, 7, 1),
    )

    result = await service(
        _request(
            external_request_id="external-3",
            curp="ZXCV123456HMNLRS11",
            nss="0012345678901234",
        ).to_command()
    )

    assert result.status is SimulatedCustomerIntakeStatus.ACCEPTED
    assert result.customer_id == str(existing.id)


@pytest.mark.asyncio
async def test_conflicting_curp_and_nss_keeps_identity_immutable() -> None:
    customers = InMemoryCustomerRepository()
    customer_services = InMemoryCustomerServiceRepository()
    existing, service_entity = await _seed_existing_identity(customers, customer_services)
    service = _service(
        customers=customers,
        customer_services=customer_services,
        service_entity=service_entity,
    )

    with pytest.raises(CurpNssConflict):
        await service(
            _request(external_request_id="external-4", nss="9999999999999999").to_command()
        )

    stored_customer = await customers.get_by_id(existing.id)
    assert stored_customer == existing
