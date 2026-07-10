from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.api.v1.customer_intake.dependencies import get_process_customer_intake
from carobra_rewards.main import create_application
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
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    CustomerIntakeRequestModel,
    CustomerModel,
    CustomerServiceModel,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.repositories import (
    SqlAlchemyCustomerIntakeUnitOfWork,
)
from carobra_rewards.modules.customer_intake.infrastructure.rewards_id_generator import (
    TokenHexRewardsIdGenerator,
)
from carobra_rewards.modules.customer_intake.ports.rewards_id_generator import (
    RewardsIdGenerator,
)


def _assert_valid_uuid(value: str) -> None:
    assert str(UUID(value)) == value


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "external_request_id": f"external-{uuid4()}",
        "curp": "ABCD123456HMNLRS09",
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


class FixedRewardsIdGenerator:
    def __init__(self, value: str) -> None:
        self._value = value

    def generate(self) -> str:
        return self._value


def _build_app(
    postgres_session_factory: async_sessionmaker[AsyncSession],
    *,
    rewards_id_generator: RewardsIdGenerator | None = None,
    mvp_start_date: date | None = date(2026, 7, 1),
) -> FastAPI:
    app = create_application()
    generator = rewards_id_generator or TokenHexRewardsIdGenerator()

    def override_service() -> ProcessSimulatedCustomerIntake:
        return ProcessSimulatedCustomerIntake(
            unit_of_work=SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory),
            rewards_id_generator=generator,
            mvp_start_date=mvp_start_date,
        )

    app.dependency_overrides[get_process_customer_intake] = override_service
    return app


async def _seed_existing_customer(
    postgres_session_factory: async_sessionmaker[AsyncSession],
    *,
    curp: str,
    nss: str,
) -> Customer:
    now = datetime.now(UTC)
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
        created_at=now,
        updated_at=now,
    )
    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        service = await uow.services.get_by_code("AFORE")
        assert service is not None
        await uow.customers.create(customer)
        await uow.customer_services.create(
            CustomerService.create(
                customer_id=customer.id,
                service_id=service.id,
                status=CustomerServiceStatus.ACTIVE,
                started_at=now,
                ended_at=None,
                created_at=now,
                updated_at=now,
            )
        )
    return customer


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_accepts_valid_full_payload(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)
    payload = _payload()

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/customers/intake", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "accepted"
    assert body["replayed"] is False
    _assert_valid_uuid(response.headers["X-Request-ID"])

    async with postgres_session_factory() as session:
        stored_intake = await session.scalar(select(CustomerIntakeRequestModel))
        stored_customer = await session.scalar(select(CustomerModel))
        stored_relation = await session.scalar(select(CustomerServiceModel))

    assert stored_intake is not None
    assert stored_customer is not None
    assert stored_relation is not None
    assert stored_intake.processing_status == IntakeProcessingStatus.ACCEPTED.value
    assert stored_intake.original_payload == payload
    assert stored_customer.first_name == "Ada"
    assert stored_customer.last_name == "Lovelace Byron"
    assert stored_customer.email == payload["correo_electronico"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_rejects_missing_required_fields_as_structurally_invalid(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload(correo_electronico=None),
        )

    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "code": "structurally_invalid",
            "message": "The intake payload is structurally invalid.",
        }
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_accepts_optional_fields_as_absent(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload(celular=None, codigo_postal=None, estado=None, ciudad=None),
        )

    assert response.status_code == 201
    assert response.json()["status"] == "accepted"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_marks_invalid_movement_type_as_not_eligible(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload(tipo_de_movimiento="Cambio"),
        )

    assert response.status_code == 200
    assert response.json()["status"] == "not_eligible"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_marks_aceptada_operaciones_as_not_eligible(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload(estatus_sf="ACEPTADA OPERACIONES"),
        )

    assert response.status_code == 200
    assert response.json()["status"] == "not_eligible"


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sf_status", "label"),
    [
        ("RECHAZADA", "rejected"),
        ("CANCELADA", "canceled"),
        ("EN PROCESO", "in-process"),
    ],
)
async def test_http_flow_marks_named_non_eligible_statuses_as_not_eligible(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
    sf_status: str,
    label: str,
) -> None:
    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload(estatus_sf=sf_status),
        )

    assert response.status_code == 200, label
    assert response.json()["status"] == "not_eligible"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_marks_pre_mvp_transfer_as_not_eligible(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload(fecha_de_traspaso="2026-06-30"),
        )

    assert response.status_code == 200
    assert response.json()["status"] == "not_eligible"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_fails_when_mvp_start_date_is_missing(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app = _build_app(postgres_session_factory, mvp_start_date=None)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/customers/intake", json=_payload())

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "configuration_incomplete"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_replays_duplicate_request_as_idempotent_duplicate(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    app = _build_app(
        postgres_session_factory, rewards_id_generator=FixedRewardsIdGenerator("RWD-fixed")
    )
    transport = ASGITransport(app=app)
    payload = _payload(external_request_id="external-fixed")

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.post("/api/v1/customers/intake", json=payload)
        replay = await client.post("/api/v1/customers/intake", json=payload)

    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["status"] == "idempotent_duplicate"
    assert replay.json()["replayed"] is True


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_reuses_existing_customer_for_duplicate_identity_by_curp(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    existing = await _seed_existing_customer(
        postgres_session_factory,
        curp="ABCD123456HMNLRS09",
        nss="0012345678901234",
    )
    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload(external_request_id="external-existing"),
        )

    assert response.status_code == 201
    assert response.json()["status"] == "accepted"
    assert response.json()["customer_id"] == str(existing.id)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_reuses_existing_customer_for_duplicate_identity_by_nss(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    existing = await _seed_existing_customer(
        postgres_session_factory,
        curp="ZXCV123456HMNLRS11",
        nss="0012345678901234",
    )
    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload(
                external_request_id="external-existing-nss",
                curp="ZXCV123456HMNLRS11",
                nss="0012345678901234",
            ),
        )

    assert response.status_code == 201
    assert response.json()["customer_id"] == str(existing.id)
