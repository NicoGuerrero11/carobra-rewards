from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
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
    ServiceModel,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.repositories import (
    SqlAlchemyCustomerIntakeUnitOfWork,
)
from carobra_rewards.modules.customer_intake.infrastructure.rewards_id_generator import (
    TokenHexRewardsIdGenerator,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _payload(
    external_request_id: str = "external-1",
    *,
    nss: str = "0012345678901234",
    name: str = " Test User ",
    email: str = "test@example.com",
    phone: str = "5551234567",
    postal_code: str = "01010",
) -> dict[str, str]:
    return {
        "source": "SISCA_SIMULATED",
        "external_request_id": external_request_id,
        "curp": "  abcd123456hmnlrs09  ",
        "nss": nss,
        "name": name,
        "email": email,
        "phone": phone,
        "postal_code": postal_code,
    }


def _customer(
    *,
    rewards_id: str,
    curp: str,
    nss: str = "0012345678901234",
    name: str = "Existing User",
    email: str = "existing@example.com",
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


def _relation(*, customer_id, service_id) -> CustomerService:
    now = _now()
    return CustomerService.create(
        customer_id=customer_id,
        service_id=service_id,
        status=CustomerServiceStatus.ACTIVE,
        started_at=now,
        ended_at=None,
        created_at=now,
        updated_at=now,
    )


async def _counts(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> tuple[int, int, int]:
    async with postgres_session_factory() as session:
        intake_count = await session.scalar(
            select(func.count()).select_from(CustomerIntakeRequestModel)
        )
        customer_count = await session.scalar(select(func.count()).select_from(CustomerModel))
        relation_count = await session.scalar(
            select(func.count()).select_from(CustomerServiceModel)
        )
    return intake_count or 0, customer_count or 0, relation_count or 0


def _build_app(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> FastAPI:
    app = create_application()

    def override_service() -> ProcessSimulatedCustomerIntake:
        return ProcessSimulatedCustomerIntake(
            unit_of_work=SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory),
            rewards_id_generator=TokenHexRewardsIdGenerator(),
        )

    app.dependency_overrides[get_process_customer_intake] = override_service
    return app


def _assert_safe_error_payload(payload: dict[str, object]) -> None:
    body = str(payload).lower()
    forbidden_fragments = [
        "abcd123456hmnlrs09",
        "0012345678901234",
        "test@example.com",
        "5551234567",
        "original_payload",
        "uq_",
        "customer_intake_requests",
        "customer_services",
        "customers",
        "constraint",
        "sqlalchemy",
        "postgres",
        "traceback",
        "insert ",
        "update ",
        "select ",
        "delete ",
    ]
    assert "detail" in payload
    assert all(fragment not in body for fragment in forbidden_fragments)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_returns_201_then_replays_200(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        created = await client.post("/api/v1/customers/intake", json=_payload())
        replay = await client.post("/api/v1/customers/intake", json=_payload())

    assert created.status_code == 201
    assert replay.status_code == 200
    assert created.json()["status"] == "APPROVED"
    assert replay.json()["status"] == "APPROVED"
    assert replay.json()["replayed"] is True
    assert set(created.json()) == {
        "intake_request_id",
        "customer_id",
        "rewards_id",
        "status",
        "replayed",
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_returns_already_active_for_existing_customer(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        service = await uow.services.get_by_code("AFORE")
        assert service is not None
        customer = _customer(rewards_id="RWD-existing", curp="ABCD123456HMNLRS09")
        await uow.customers.create(customer)
        await uow.customer_services.create(
            _relation(customer_id=customer.id, service_id=service.id)
        )

    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/customers/intake", json=_payload("external-2"))

    assert response.status_code == 200
    assert response.json()["status"] == "ALREADY_ACTIVE"
    assert response.json()["replayed"] is False
    assert response.json()["rewards_id"] == "RWD-existing"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_keeps_already_active_for_same_nss_with_combined_contact_differences(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        service = await uow.services.get_by_code("AFORE")
        assert service is not None
        customer = _customer(
            rewards_id="RWD-existing",
            curp="ABCD123456HMNLRS09",
            name="Existing User",
            email="existing@example.com",
            phone="5550000000",
            postal_code="99999",
        )
        await uow.customers.create(customer)
        await uow.customer_services.create(
            _relation(customer_id=customer.id, service_id=service.id)
        )

    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload(
                "external-contact-diff",
                name=" Changed Name ",
                email="changed@example.com",
                phone="5551234567",
                postal_code="01010",
            ),
        )

    assert response.status_code == 200
    assert response.json()["status"] == "ALREADY_ACTIVE"
    assert response.json()["rewards_id"] == "RWD-existing"
    async with postgres_session_factory() as session:
        stored_customer = await session.scalar(select(CustomerModel))
        assert stored_customer is not None
        assert stored_customer.name == "Existing User"
        assert stored_customer.email == "existing@example.com"
        assert stored_customer.phone == "5550000000"
        assert stored_customer.postal_code == "99999"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_replays_already_active_without_creating_duplicates(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        service = await uow.services.get_by_code("AFORE")
        assert service is not None
        customer = _customer(rewards_id="RWD-existing", curp="ABCD123456HMNLRS09")
        await uow.customers.create(customer)
        await uow.customer_services.create(
            _relation(customer_id=customer.id, service_id=service.id)
        )

    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.post("/api/v1/customers/intake", json=_payload("external-aa"))
        replay = await client.post("/api/v1/customers/intake", json=_payload("external-aa"))

    assert first.status_code == 200
    assert replay.status_code == 200
    assert first.json()["status"] == "ALREADY_ACTIVE"
    assert first.json()["replayed"] is False
    assert replay.json()["status"] == "ALREADY_ACTIVE"
    assert replay.json()["replayed"] is True
    assert first.json()["customer_id"] == replay.json()["customer_id"]
    assert first.json()["rewards_id"] == replay.json()["rewards_id"] == "RWD-existing"
    assert await _counts(postgres_session_factory) == (1, 1, 1)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_returns_409_for_incompatible_existing_intake(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    async with postgres_session_factory() as session:
        session.add(
            CustomerIntakeRequestModel(
                source="SISCA_SIMULATED",
                external_request_id="external-1",
                curp="ABCD123456HMNLRS09",
                processing_status="PROCESSING",
                processing_details={"step": "processing"},
                original_payload=_payload(),
                customer_id=None,
                received_at=_now(),
                processed_at=None,
            )
        )
        await session.commit()

    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/customers/intake", json=_payload())

    assert response.status_code == 409
    assert response.json() == {
        "detail": {
            "code": "external_request_conflict",
            "message": (
                "The external request is already being processed "
                "in an incompatible state."
            ),
        }
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_returns_409_and_persists_identity_conflict(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        service = await uow.services.get_by_code("AFORE")
        assert service is not None
        customer = _customer(
            rewards_id="RWD-existing",
            curp="ABCD123456HMNLRS09",
            nss="0012345678901234",
        )
        await uow.customers.create(customer)
        await uow.customer_services.create(
            _relation(customer_id=customer.id, service_id=service.id)
        )

    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)
    conflict_payload = _payload("external-conflict", nss="0000000000000001")
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/customers/intake", json=conflict_payload)

    assert response.status_code == 409
    assert response.json() == {
        "detail": {
            "code": "curp_nss_conflict",
            "message": "The simulated intake flow could not reuse the existing customer safely.",
        }
    }
    assert "detail.detail" not in response.text
    _assert_safe_error_payload(response.json())

    async with postgres_session_factory() as session:
        stored_intakes = (
            (
                await session.execute(
                    select(CustomerIntakeRequestModel).order_by(
                        CustomerIntakeRequestModel.received_at.asc()
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(stored_intakes) == 1
        stored = stored_intakes[0]
        assert stored.processing_status == IntakeProcessingStatus.IDENTITY_CONFLICT.value
        assert stored.processing_details == {"reason": "curp_nss_conflict"}
        assert stored.processed_at is not None
        assert stored.customer_id is not None
        assert stored.original_payload == conflict_payload

        stored_customer = await session.scalar(select(CustomerModel))
        assert stored_customer is not None
        assert stored_customer.rewards_id == "RWD-existing"
        assert stored_customer.nss == "0012345678901234"

        stored_relation = await session.scalar(select(CustomerServiceModel))
        assert stored_relation is not None
        assert stored_relation.status == CustomerServiceStatus.ACTIVE.value

    assert await _counts(postgres_session_factory) == (1, 1, 1)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_replays_identity_conflict_without_duplicate_intake(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        service = await uow.services.get_by_code("AFORE")
        assert service is not None
        customer = _customer(
            rewards_id="RWD-existing",
            curp="ABCD123456HMNLRS09",
            nss="0012345678901234",
        )
        await uow.customers.create(customer)
        await uow.customer_services.create(
            _relation(customer_id=customer.id, service_id=service.id)
        )

    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)
    first_payload = _payload("external-conflict-replay", nss="0000000000000001")
    replay_payload = _payload("external-conflict-replay", nss="9999999999999999")
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.post("/api/v1/customers/intake", json=first_payload)
        replay = await client.post("/api/v1/customers/intake", json=replay_payload)

    for response in (first, replay):
        assert response.status_code == 409
        assert response.json() == {
            "detail": {
                "code": "curp_nss_conflict",
                "message": (
                    "The simulated intake flow could not reuse "
                    "the existing customer safely."
                ),
            }
        }
        assert "detail.detail" not in response.text

    async with postgres_session_factory() as session:
        stored_intakes = (
            (
                await session.execute(
                    select(CustomerIntakeRequestModel).order_by(
                        CustomerIntakeRequestModel.received_at.asc()
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(stored_intakes) == 1
        stored = stored_intakes[0]
        assert stored.processing_status == IntakeProcessingStatus.IDENTITY_CONFLICT.value
        assert stored.processing_details == {"reason": "curp_nss_conflict"}
        assert stored.original_payload == first_payload

    assert await _counts(postgres_session_factory) == (1, 1, 1)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_returns_500_for_successful_intake_inconsistency(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    now = _now()
    async with postgres_session_factory() as session:
        session.add(
            CustomerIntakeRequestModel(
                source="SISCA_SIMULATED",
                external_request_id="external-inconsistent",
                curp="ABCD123456HMNLRS09",
                processing_status=IntakeProcessingStatus.APPROVED.value,
                processing_details=None,
                original_payload=_payload("external-inconsistent"),
                customer_id=None,
                received_at=now,
                processed_at=now,
            )
        )
        await session.commit()

    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload("external-inconsistent"),
        )

    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == {
        "code": "successful_intake_inconsistency",
        "message": "The stored successful intake could not be replayed safely.",
    }
    _assert_safe_error_payload(body)
    assert await _counts(postgres_session_factory) == (1, 0, 0)


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("relation_status", "expected_code"),
    [
        (None, "customer_service_inconsistency"),
        (CustomerServiceStatus.INACTIVE, "customer_service_inconsistency"),
        (CustomerServiceStatus.ENDED, "customer_service_inconsistency"),
    ],
)
async def test_http_flow_returns_500_for_customer_service_inconsistency(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
    relation_status: CustomerServiceStatus | None,
    expected_code: str,
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    async with SqlAlchemyCustomerIntakeUnitOfWork(postgres_session_factory) as uow:
        service = await uow.services.get_by_code("AFORE")
        assert service is not None
        customer = _customer(rewards_id="RWD-existing", curp="ABCD123456HMNLRS09")
        await uow.customers.create(customer)
        if relation_status is not None:
            relation = _relation(customer_id=customer.id, service_id=service.id)
            if relation_status is not CustomerServiceStatus.ACTIVE:
                relation = CustomerService(
                    id=relation.id,
                    customer_id=relation.customer_id,
                    service_id=relation.service_id,
                    status=relation_status,
                    started_at=relation.started_at,
                    ended_at=relation.ended_at,
                    created_at=relation.created_at,
                    updated_at=relation.updated_at,
                )
            await uow.customer_services.create(relation)

    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/customers/intake",
            json=_payload(f"external-inconsistency-{relation_status or 'missing'}"),
        )

    assert response.status_code == 500
    body = response.json()
    assert body["detail"]["code"] == expected_code
    assert set(body["detail"]) == {"code", "message"}
    _assert_safe_error_payload(body)
    assert await _counts(postgres_session_factory) == (0, 1, 0 if relation_status is None else 1)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_flow_returns_500_when_afore_service_is_missing(
    migrated_postgres_database: str,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    assert migrated_postgres_database.startswith("postgresql")
    async with postgres_session_factory() as session:
        await session.execute(delete(ServiceModel).where(ServiceModel.code == "AFORE"))
        await session.commit()

    app = _build_app(postgres_session_factory)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/customers/intake", json=_payload())

    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == {
        "code": "service_not_found",
        "message": "The simulated intake flow is temporarily unavailable.",
    }
    _assert_safe_error_payload(body)
