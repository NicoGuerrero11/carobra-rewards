from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from types import SimpleNamespace
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.sql.dml import Delete

from carobra_rewards.api.v1.customer_intake.schemas import CustomerIntakeRequest
from carobra_rewards.core.config import get_settings, reset_settings_cache
from carobra_rewards.infrastructure.database.session import reset_engine_cache
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

CUSTOMER_INTAKE_PATH = "/api/v1/customers/intake"
REWARDS_ID_PATTERN = re.compile(r"^RWD-[0-9a-f]{32}$")
_PRODUCTION_MARKERS = ("prod", "production")


class DemoConfigurationError(Exception):
    """Raised when the demo cannot prove a safe execution environment."""


class DemoExecutionError(Exception):
    """Raised when the real flow does not match the expected walkthrough."""


@dataclass(slots=True, frozen=True)
class SafeEnvironment:
    app_env: str
    test_database_url: str


@dataclass(slots=True)
class ExecutionMarkers:
    source: str
    external_request_id: str
    customer_curp: str


@dataclass(slots=True)
class CreatedRecordIds:
    intake_request_ids: set[UUID] = field(default_factory=set)
    customer_ids: set[UUID] = field(default_factory=set)
    customer_service_ids: set[UUID] = field(default_factory=set)

    def is_empty(self) -> bool:
        return not (self.intake_request_ids or self.customer_ids or self.customer_service_ids)


@dataclass(slots=True, frozen=True)
class PersistedSnapshot:
    intake: CustomerIntakeRequestModel
    customer: CustomerModel
    customer_service: CustomerServiceModel
    service: ServiceModel


@dataclass(slots=True, frozen=True)
class ScenarioRecord:
    name: str
    outcome: str
    explanation: str
    request_payload: dict[str, object]
    responses: list[dict[str, object]]
    persistence_summary: dict[str, object]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Demuestra el alta provisional SISCA_SIMULATED -> Rewards usando el endpoint real."
        ),
    )
    parser.add_argument(
        "--keep-data",
        action="store_true",
        help="Conserva los registros sinteticos creados por esta ejecucion.",
    )
    parser.add_argument(
        "--suite",
        choices=("single-approved", "api-proof"),
        default="single-approved",
        help=(
            "Selecciona la demo a ejecutar: "
            "`single-approved` conserva la demo tecnica existente y "
            "`api-proof` ejecuta varios escenarios para demostrar la API."
        ),
    )
    parser.add_argument(
        "--allow-legacy",
        action="store_true",
        help="Habilita explícitamente la demo histórica del intake retirado.",
    )
    return parser.parse_args(argv)


def _contains_production_marker(value: str | None) -> bool:
    if value is None:
        return False
    lowered = value.lower()
    return any(marker in lowered for marker in _PRODUCTION_MARKERS)


def _url_parts(database_url: str) -> SimpleNamespace:
    parts = urlsplit(database_url)
    return SimpleNamespace(
        scheme=parts.scheme.lower(),
        hostname=(parts.hostname or "").lower(),
        path=parts.path or "",
        username=(parts.username or "").lower(),
    )


def validate_safe_environment(
    *,
    app_env: str | None,
    test_database_url: str | None,
    primary_database_url: str | None,
) -> SafeEnvironment:
    if not test_database_url:
        raise DemoConfigurationError("TEST_DATABASE_URL es obligatorio.")
    if app_env != "test":
        raise DemoConfigurationError("APP_ENV debe ser exactamente 'test'.")
    if primary_database_url and primary_database_url == test_database_url:
        raise DemoConfigurationError(
            "DATABASE_URL y TEST_DATABASE_URL no pueden apuntar a la misma base."
        )

    test_parts = _url_parts(test_database_url)
    if test_parts.scheme not in {"postgresql+asyncpg", "postgresql"}:
        raise DemoConfigurationError("TEST_DATABASE_URL debe apuntar a PostgreSQL.")

    if _contains_production_marker(primary_database_url):
        raise DemoConfigurationError("La configuracion actual marca DATABASE_URL como productiva.")

    production_signals = (
        app_env,
        test_database_url,
        test_parts.hostname,
        test_parts.path,
        test_parts.username,
    )
    if any(_contains_production_marker(value) for value in production_signals):
        raise DemoConfigurationError(
            "TEST_DATABASE_URL fue identificada como configuracion potencialmente productiva."
        )

    return SafeEnvironment(app_env=app_env, test_database_url=test_database_url)


def configure_demo_environment() -> SafeEnvironment:
    reset_settings_cache()
    reset_engine_cache()
    settings = get_settings()

    test_database_url = (
        settings.test_database_url.get_secret_value()
        if settings.test_database_url is not None
        else None
    )
    primary_database_url = (
        settings.database_url.get_secret_value() if settings.database_url is not None else None
    )
    safe_environment = validate_safe_environment(
        app_env=settings.app_env,
        test_database_url=test_database_url,
        primary_database_url=primary_database_url,
    )

    os.environ["APP_ENV"] = safe_environment.app_env
    os.environ["DATABASE_URL"] = safe_environment.test_database_url

    reset_settings_cache()
    reset_engine_cache()
    return safe_environment


def build_synthetic_payload() -> dict[str, str]:
    token = uuid4().hex
    curp_suffix = token[:2].upper()
    external_suffix = token[:12]
    email_suffix = token[12:24]
    nss_digits = f"{uuid4().int % 10**11:011d}"
    phone_digits = f"{uuid4().int % 10**10:010d}"
    return {
        "source": "SISCA_SIMULATED",
        "external_request_id": f"demo-sisca-{external_suffix}",
        "curp": f"DEMX900101HDFSCA{curp_suffix}",
        "nss": nss_digits,
        "name": "Demo Synthetic Customer",
        "email": f"demo-{email_suffix}@example.test",
        "phone": phone_digits,
        "postal_code": "01010",
    }


def build_named_payload(
    scenario_name: str,
    *,
    source: str = "SISCA_SIMULATED",
    curp: str | None = None,
    nss: str | None = None,
    external_request_id: str | None = None,
    name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    postal_code: str = "01010",
) -> dict[str, str]:
    token = uuid4().hex
    compact_name = scenario_name.lower().replace("_", "-")
    normalized_curp = curp or f"DEMX900101HDF{token[:5].upper()}"[:18]
    nss_value = nss or f"{uuid4().int % 10**11:011d}"
    return {
        "source": source,
        "external_request_id": external_request_id or f"demo-{compact_name}-{token[:8]}",
        "curp": normalized_curp,
        "nss": nss_value,
        "name": name or f"Demo {scenario_name.replace('_', ' ').title()}",
        "email": email or f"{compact_name}-{token[8:16]}@example.test",
        "phone": phone or f"55{uuid4().int % 10**8:08d}",
        "postal_code": postal_code,
    }


def build_execution_markers(payload: dict[str, str]) -> ExecutionMarkers:
    return ExecutionMarkers(
        source=payload["source"],
        external_request_id=payload["external_request_id"],
        customer_curp=payload["curp"].strip().upper(),
    )


def _validate_uuid(value: str, *, field_name: str) -> None:
    if str(UUID(value)) != value:
        raise DemoExecutionError(f"{field_name} no tiene formato UUID valido.")


def _validate_rewards_id(value: str) -> None:
    if not REWARDS_ID_PATTERN.fullmatch(value):
        raise DemoExecutionError("rewards_id no cumple el formato actual esperado.")


def _build_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


async def _submit_http_request(payload: dict[str, object]) -> tuple[int, dict[str, object], str]:
    from carobra_rewards.main import create_application

    app = create_application()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(CUSTOMER_INTAKE_PATH, json=payload)

    request_id = response.headers.get("X-Request-ID")
    if request_id is None:
        raise DemoExecutionError("La respuesta no incluyo X-Request-ID.")
    _validate_uuid(request_id, field_name="X-Request-ID")
    return response.status_code, response.json(), request_id


async def _submit_request(payload: dict[str, str]) -> tuple[dict[str, object], str]:
    CustomerIntakeRequest.model_validate(payload)
    status_code, body, request_id = await _submit_http_request(payload)
    if status_code != 201:
        raise DemoExecutionError(f"Se esperaba HTTP 201 y se obtuvo {status_code}.")

    intake_request_id = str(body.get("intake_request_id"))
    customer_id = str(body.get("customer_id"))
    rewards_id = str(body.get("rewards_id"))
    status = body.get("status")
    replayed = body.get("replayed")

    _validate_uuid(intake_request_id, field_name="intake_request_id")
    _validate_uuid(customer_id, field_name="customer_id")
    _validate_rewards_id(rewards_id)
    if status != "APPROVED":
        raise DemoExecutionError(f"Se esperaba status APPROVED y se obtuvo {status}.")
    if replayed is not False:
        raise DemoExecutionError("La primera ejecucion no debe quedar marcada como replayed.")

    return body, request_id


async def load_persisted_snapshot(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    intake_request_id: UUID,
    customer_id: UUID,
) -> PersistedSnapshot:
    async with session_factory() as session:
        intake = await session.get(CustomerIntakeRequestModel, intake_request_id)
        customer = await session.get(CustomerModel, customer_id)
        if intake is None:
            raise DemoExecutionError("No se encontro el intake persistido.")
        if customer is None:
            raise DemoExecutionError("No se encontro el customer persistido.")

        relation = await session.scalar(
            select(CustomerServiceModel).where(CustomerServiceModel.customer_id == customer.id)
        )
        if relation is None:
            raise DemoExecutionError("No se encontro la relacion customer-service.")

        service = await session.get(ServiceModel, relation.service_id)
        if service is None:
            raise DemoExecutionError("No se encontro el servicio asociado.")

        return PersistedSnapshot(
            intake=intake,
            customer=customer,
            customer_service=relation,
            service=service,
        )


async def load_counts_for_execution(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    markers: ExecutionMarkers,
    customer_id: UUID,
) -> tuple[int, int, int]:
    async with session_factory() as session:
        intake_count = await session.scalar(
            select(func.count())
            .select_from(CustomerIntakeRequestModel)
            .where(
                CustomerIntakeRequestModel.source == markers.source,
                CustomerIntakeRequestModel.external_request_id == markers.external_request_id,
            )
        )
        customer_count = await session.scalar(
            select(func.count()).select_from(CustomerModel).where(CustomerModel.id == customer_id)
        )
        relation_count = await session.scalar(
            select(func.count())
            .select_from(CustomerServiceModel)
            .join(ServiceModel, CustomerServiceModel.service_id == ServiceModel.id)
            .where(
                CustomerServiceModel.customer_id == customer_id,
                ServiceModel.code == "AFORE",
            )
        )

    return intake_count or 0, customer_count or 0, relation_count or 0


async def load_intake_by_markers(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    markers: ExecutionMarkers,
) -> CustomerIntakeRequestModel | None:
    async with session_factory() as session:
        return await session.scalar(
            select(CustomerIntakeRequestModel).where(
                CustomerIntakeRequestModel.source == markers.source,
                CustomerIntakeRequestModel.external_request_id == markers.external_request_id,
            )
        )


async def load_customer_count_for_curp(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    curp: str,
) -> int:
    async with session_factory() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(CustomerModel)
            .where(CustomerModel.curp == curp.strip().upper())
        )
    return count or 0


async def seed_active_afore_customer(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    curp: str,
    nss: str,
    name: str,
    email: str,
) -> tuple[Customer, CustomerService]:
    now = datetime.now(UTC)
    customer = Customer.create(
        rewards_id=f"RWD-{uuid4().hex}",
        curp=curp,
        nss=nss,
        name=name,
        email=email,
        phone="5512345678",
        postal_code="01010",
        customer_status=CustomerStatus.PENDING_ONBOARDING,
        onboarding_status=OnboardingStatus.PENDING,
        created_at=now,
        updated_at=now,
    )

    async with SqlAlchemyCustomerIntakeUnitOfWork(session_factory) as uow:
        service = await uow.services.get_by_code("AFORE")
        if service is None:
            raise DemoExecutionError("No existe el servicio AFORE para sembrar el escenario.")
        relation = CustomerService.create(
            customer_id=customer.id,
            service_id=service.id,
            status=CustomerServiceStatus.ACTIVE,
            started_at=now,
            ended_at=None,
            created_at=now,
            updated_at=now,
        )
        await uow.customers.create(customer)
        await uow.customer_services.create(relation)

    return customer, relation


async def seed_processing_intake(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    payload: dict[str, object],
) -> CustomerIntakeRequestModel:
    async with session_factory() as session:
        intake = CustomerIntakeRequestModel(
            source=str(payload["source"]),
            external_request_id=str(payload["external_request_id"]),
            curp=str(payload["curp"]).strip().upper(),
            processing_status=IntakeProcessingStatus.PROCESSING.value,
            processing_details={"step": "processing"},
            original_payload=dict(payload),
            customer_id=None,
            received_at=datetime.now(UTC),
            processed_at=None,
        )
        session.add(intake)
        await session.commit()
        await session.refresh(intake)
        return intake


async def seed_terminal_intake_without_customer(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    payload: dict[str, object],
    processing_status: IntakeProcessingStatus,
    processing_details: dict[str, object] | None,
) -> CustomerIntakeRequestModel:
    now = datetime.now(UTC)
    async with session_factory() as session:
        intake = CustomerIntakeRequestModel(
            source=str(payload["source"]),
            external_request_id=str(payload["external_request_id"]),
            curp=str(payload["curp"]).strip().upper(),
            processing_status=processing_status.value,
            processing_details=processing_details,
            original_payload=dict(payload),
            customer_id=None,
            received_at=now,
            processed_at=now,
        )
        session.add(intake)
        await session.commit()
        await session.refresh(intake)
        return intake


def build_cleanup_statements(created_ids: CreatedRecordIds) -> list[Delete]:
    statements: list[Delete] = []
    if created_ids.customer_ids:
        statements.append(
            delete(CustomerServiceModel).where(
                CustomerServiceModel.customer_id.in_(tuple(created_ids.customer_ids))
            )
        )
    elif created_ids.customer_service_ids:
        statements.append(
            delete(CustomerServiceModel).where(
                CustomerServiceModel.id.in_(tuple(created_ids.customer_service_ids))
            )
        )
    if created_ids.intake_request_ids:
        statements.append(
            delete(CustomerIntakeRequestModel).where(
                CustomerIntakeRequestModel.id.in_(tuple(created_ids.intake_request_ids))
            )
        )
    if created_ids.customer_ids:
        statements.append(
            delete(CustomerModel).where(CustomerModel.id.in_(tuple(created_ids.customer_ids)))
        )
    return statements


async def cleanup_created_records(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> tuple[int, int, int]:
    if created_ids.is_empty():
        return 0, 0, 0

    async with session_factory() as session:
        for statement in build_cleanup_statements(created_ids):
            await session.execute(statement)
        await session.commit()

    async with session_factory() as verification_session:
        remaining_intakes = await verification_session.scalar(
            select(func.count())
            .select_from(CustomerIntakeRequestModel)
            .where(CustomerIntakeRequestModel.id.in_(tuple(created_ids.intake_request_ids)))
        )
        remaining_customers = await verification_session.scalar(
            select(func.count())
            .select_from(CustomerModel)
            .where(CustomerModel.id.in_(tuple(created_ids.customer_ids)))
        )
        remaining_relations = await verification_session.scalar(
            select(func.count())
            .select_from(CustomerServiceModel)
            .where(CustomerServiceModel.id.in_(tuple(created_ids.customer_service_ids)))
        )

    return remaining_intakes or 0, remaining_customers or 0, remaining_relations or 0


def _print_step(step_number: int, title: str) -> None:
    print(f"Paso {step_number}. {title}")


def _print_json_block(title: str, payload: dict[str, object]) -> None:
    print(f"  {title}")
    print(json.dumps(payload, indent=2, ensure_ascii=True, sort_keys=True))


def _print_scenario_record(index: int, record: ScenarioRecord) -> None:
    print(f"  Escenario {index}. {record.name}")
    print(f"    Resultado: {record.outcome}")
    print(f"    Explicacion: {record.explanation}")
    _print_json_block("Solicitud:", record.request_payload)
    for response_index, response in enumerate(record.responses, start=1):
        _print_json_block(f"Respuesta {response_index}:", response)
    _print_json_block("Persistencia:", record.persistence_summary)


async def run_single_approved_demo(keep_data: bool) -> int:
    safe_environment = configure_demo_environment()
    payload = build_synthetic_payload()
    markers = build_execution_markers(payload)
    created_ids = CreatedRecordIds()
    engine = create_async_engine(safe_environment.test_database_url, pool_pre_ping=True)
    session_factory = _build_session_factory(engine)

    try:
        _print_step(1, "Entorno")
        print("  ambiente seguro confirmado")
        print("  base de prueba confirmada")

        _print_step(2, "Solicitud")
        print(json.dumps(payload, indent=2, ensure_ascii=True, sort_keys=True))

        _print_step(3, "Validacion y procesamiento")
        response_body, request_id = await _submit_request(payload)
        intake_request_id = UUID(str(response_body["intake_request_id"]))
        customer_id = UUID(str(response_body["customer_id"]))
        created_ids.intake_request_ids.add(intake_request_id)
        created_ids.customer_ids.add(customer_id)
        print("  schema HTTP real validado")
        print("  HTTP 201")
        print(f"  X-Request-ID: {request_id}")
        print(
            json.dumps(
                {
                    "intake_request_id": response_body["intake_request_id"],
                    "customer_id": response_body["customer_id"],
                    "rewards_id": response_body["rewards_id"],
                    "status": response_body["status"],
                    "replayed": response_body["replayed"],
                },
                indent=2,
                ensure_ascii=True,
                sort_keys=True,
            )
        )

        _print_step(4, "Persistencia")
        snapshot = await load_persisted_snapshot(
            session_factory,
            intake_request_id=intake_request_id,
            customer_id=customer_id,
        )
        created_ids.customer_service_ids.add(snapshot.customer_service.id)
        original_payload_matches = snapshot.intake.original_payload == payload
        if snapshot.intake.processing_status != "APPROVED":
            raise DemoExecutionError("El intake persistido no quedo en APPROVED.")
        if snapshot.intake.processed_at is None:
            raise DemoExecutionError("El intake persistido no tiene processed_at.")
        if snapshot.customer.customer_status != "PENDING_ONBOARDING":
            raise DemoExecutionError("El customer persistido no quedo en PENDING_ONBOARDING.")
        if snapshot.customer.onboarding_status != "PENDING":
            raise DemoExecutionError("El customer persistido no quedo en PENDING.")
        if snapshot.customer.rewards_id != response_body["rewards_id"]:
            raise DemoExecutionError("El Rewards ID persistido no coincide con la respuesta.")
        if snapshot.service.code != "AFORE":
            raise DemoExecutionError("La relacion persistida no apunta al servicio AFORE.")
        if snapshot.customer_service.status != "ACTIVE":
            raise DemoExecutionError("La relacion AFORE no quedo ACTIVE.")

        print(f"  intake: ID={snapshot.intake.id}")
        print("  intake: processing_status=APPROVED")
        print("  intake: processed_at presente")
        print(f"  intake: original_payload coincide={original_payload_matches}")
        print(f"  customer: ID={snapshot.customer.id}")
        print("  customer: status=PENDING_ONBOARDING")
        print("  customer: onboarding_status=PENDING")
        print("  customer: Rewards ID coherente con la respuesta")
        print("  relacion de servicio: servicio=AFORE")
        print("  relacion de servicio: estado=ACTIVE")

        _print_step(5, "No duplicados")
        intake_count, customer_count, relation_count = await load_counts_for_execution(
            session_factory,
            markers=markers,
            customer_id=customer_id,
        )
        if (intake_count, customer_count, relation_count) != (1, 1, 1):
            raise DemoExecutionError(
                "Los conteos acotados a la ejecucion no son intake=1, customer=1, relacion=1."
            )
        print(f"  intake={intake_count}")
        print(f"  customer={customer_count}")
        print(f"  relacion AFORE={relation_count}")

        _print_step(6, "Limpieza")
        if keep_data:
            print("  limpieza omitida por --keep-data")
            print("  quedaron datos sinteticos en la base de prueba")
            print(f"  intake_request_id={intake_request_id}")
            print(f"  customer_id={customer_id}")
            print(f"  customer_service_id={snapshot.customer_service.id}")
        else:
            remaining = await cleanup_created_records(session_factory, created_ids)
            if remaining != (0, 0, 0):
                raise DemoExecutionError("La limpieza no elimino todos los registros creados.")
            print("  registros de la ejecucion eliminados")
            print("  verificacion posterior a limpieza=sin residuos")

        print("DEMO COMPLETADA")
        return 0
    finally:
        try:
            if not keep_data and not created_ids.is_empty():
                await cleanup_created_records(session_factory, created_ids)
        finally:
            await engine.dispose()


async def _run_approved_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload("approved_new_customer")
    markers = build_execution_markers(payload)
    status_code, response_body, request_id = await _submit_http_request(payload)
    if status_code != 201:
        raise DemoExecutionError(
            f"approved_new_customer esperaba HTTP 201 y recibio {status_code}."
        )
    if response_body.get("status") != "APPROVED" or response_body.get("replayed") is not False:
        raise DemoExecutionError("approved_new_customer no devolvio APPROVED con replayed=false.")

    intake_request_id = UUID(str(response_body["intake_request_id"]))
    customer_id = UUID(str(response_body["customer_id"]))
    created_ids.intake_request_ids.add(intake_request_id)
    created_ids.customer_ids.add(customer_id)

    snapshot = await load_persisted_snapshot(
        session_factory,
        intake_request_id=intake_request_id,
        customer_id=customer_id,
    )
    created_ids.customer_service_ids.add(snapshot.customer_service.id)
    counts = await load_counts_for_execution(
        session_factory,
        markers=markers,
        customer_id=customer_id,
    )
    if counts != (1, 1, 1):
        raise DemoExecutionError(
            "approved_new_customer no quedo con conteos intake=1, customer=1, relacion=1."
        )

    return ScenarioRecord(
        name="approved_new_customer",
        outcome="HTTP 201 APPROVED",
        explanation="Cliente nuevo creado por la API y persistido completo en Neon.",
        request_payload=payload,
        responses=[
            {
                "http_status": status_code,
                "x_request_id": request_id,
                **response_body,
            }
        ],
        persistence_summary={
            "intake_request_id": str(snapshot.intake.id),
            "intake_status": snapshot.intake.processing_status,
            "customer_id": str(snapshot.customer.id),
            "customer_status": snapshot.customer.customer_status,
            "onboarding_status": snapshot.customer.onboarding_status,
            "rewards_id": snapshot.customer.rewards_id,
            "service_code": snapshot.service.code,
            "service_status": snapshot.customer_service.status,
            "bounded_counts": {
                "intakes_for_external_request": counts[0],
                "customers_for_response_customer_id": counts[1],
                "afore_relations_for_customer": counts[2],
            },
        },
    )


async def _run_approved_replay_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload("approved_replay")
    markers = build_execution_markers(payload)
    first_status, first_body, first_request_id = await _submit_http_request(payload)
    replay_status, replay_body, replay_request_id = await _submit_http_request(payload)
    if first_status != 201 or replay_status != 200:
        raise DemoExecutionError("approved_replay esperaba HTTP 201 seguido de HTTP 200.")
    if first_body.get("status") != "APPROVED" or replay_body.get("status") != "APPROVED":
        raise DemoExecutionError(
            "approved_replay no devolvio status APPROVED en ambas ejecuciones."
        )
    if first_body.get("replayed") is not False or replay_body.get("replayed") is not True:
        raise DemoExecutionError("approved_replay no marco correctamente replayed.")
    if first_body["intake_request_id"] != replay_body["intake_request_id"]:
        raise DemoExecutionError("approved_replay no devolvio el mismo intake_request_id.")
    if first_body["customer_id"] != replay_body["customer_id"]:
        raise DemoExecutionError("approved_replay no devolvio el mismo customer_id.")

    intake_request_id = UUID(str(first_body["intake_request_id"]))
    customer_id = UUID(str(first_body["customer_id"]))
    created_ids.intake_request_ids.add(intake_request_id)
    created_ids.customer_ids.add(customer_id)

    snapshot = await load_persisted_snapshot(
        session_factory,
        intake_request_id=intake_request_id,
        customer_id=customer_id,
    )
    created_ids.customer_service_ids.add(snapshot.customer_service.id)
    counts = await load_counts_for_execution(
        session_factory,
        markers=markers,
        customer_id=customer_id,
    )
    if counts != (1, 1, 1):
        raise DemoExecutionError("approved_replay genero duplicados fuera del conteo esperado.")

    return ScenarioRecord(
        name="approved_replay_same_external_request",
        outcome="HTTP 201 seguido de HTTP 200 replayed=true",
        explanation=(
            "La API demuestra idempotencia: el segundo request reutiliza la misma identidad."
        ),
        request_payload=payload,
        responses=[
            {"http_status": first_status, "x_request_id": first_request_id, **first_body},
            {"http_status": replay_status, "x_request_id": replay_request_id, **replay_body},
        ],
        persistence_summary={
            "intake_request_id": str(snapshot.intake.id),
            "customer_id": str(snapshot.customer.id),
            "rewards_id": snapshot.customer.rewards_id,
            "intake_status": snapshot.intake.processing_status,
            "bounded_counts": {
                "intakes_for_external_request": counts[0],
                "customers_for_response_customer_id": counts[1],
                "afore_relations_for_customer": counts[2],
            },
        },
    )


async def _run_already_active_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload(
        "already_active",
        nss="0012345678901234",
        name="Demo Already Active Incoming",
        email="already-active-incoming@example.test",
    )
    seeded_customer, seeded_relation = await seed_active_afore_customer(
        session_factory,
        curp=payload["curp"],
        nss=payload["nss"],
        name="Demo Existing AFORE Customer",
        email="already-active-existing@example.test",
    )
    created_ids.customer_ids.add(seeded_customer.id)
    created_ids.customer_service_ids.add(seeded_relation.id)

    markers = build_execution_markers(payload)
    status_code, response_body, request_id = await _submit_http_request(payload)
    if status_code != 200:
        raise DemoExecutionError(f"already_active esperaba HTTP 200 y recibio {status_code}.")
    if (
        response_body.get("status") != "ALREADY_ACTIVE"
        or response_body.get("replayed") is not False
    ):
        raise DemoExecutionError("already_active no devolvio ALREADY_ACTIVE con replayed=false.")
    if response_body.get("customer_id") != str(seeded_customer.id):
        raise DemoExecutionError("already_active no reutilizo el customer sembrado.")

    intake = await load_intake_by_markers(session_factory, markers=markers)
    if intake is None:
        raise DemoExecutionError("already_active no persistio el intake esperado.")
    created_ids.intake_request_ids.add(intake.id)
    if intake.processing_status != IntakeProcessingStatus.ALREADY_ACTIVE.value:
        raise DemoExecutionError("already_active no persistio ALREADY_ACTIVE en la base.")

    customer_count = await load_customer_count_for_curp(session_factory, curp=payload["curp"])
    counts = await load_counts_for_execution(
        session_factory,
        markers=markers,
        customer_id=seeded_customer.id,
    )
    if customer_count != 1 or counts[0] != 1 or counts[2] != 1:
        raise DemoExecutionError("already_active no conservo la cardinalidad esperada.")

    return ScenarioRecord(
        name="already_active_existing_customer",
        outcome="HTTP 200 ALREADY_ACTIVE",
        explanation="La API reutiliza el cliente activo existente y solo crea un intake asociado.",
        request_payload=payload,
        responses=[
            {
                "http_status": status_code,
                "x_request_id": request_id,
                **response_body,
            }
        ],
        persistence_summary={
            "seeded_customer_id": str(seeded_customer.id),
            "returned_customer_id": response_body["customer_id"],
            "returned_rewards_id": response_body["rewards_id"],
            "intake_request_id": str(intake.id),
            "intake_status": intake.processing_status,
            "customer_count_for_curp": customer_count,
            "bounded_counts": {
                "intakes_for_external_request": counts[0],
                "customers_for_seeded_customer_id": counts[1],
                "afore_relations_for_customer": counts[2],
            },
        },
    )


async def _run_identity_conflict_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload(
        "identity_conflict",
        nss="0000000000000001",
        name="Demo Identity Conflict Incoming",
        email="identity-conflict-incoming@example.test",
    )
    seeded_customer, seeded_relation = await seed_active_afore_customer(
        session_factory,
        curp=payload["curp"],
        nss="0012345678901234",
        name="Demo Existing Conflict Customer",
        email="identity-conflict-existing@example.test",
    )
    created_ids.customer_ids.add(seeded_customer.id)
    created_ids.customer_service_ids.add(seeded_relation.id)

    markers = build_execution_markers(payload)
    status_code, response_body, request_id = await _submit_http_request(payload)
    if status_code != 409:
        raise DemoExecutionError(f"identity_conflict esperaba HTTP 409 y recibio {status_code}.")
    if response_body != {
        "detail": {
            "code": "curp_nss_conflict",
            "message": "The simulated intake flow could not reuse the existing customer safely.",
        }
    }:
        raise DemoExecutionError("identity_conflict no devolvio el cuerpo 409 esperado.")

    intake = await load_intake_by_markers(session_factory, markers=markers)
    if intake is None:
        raise DemoExecutionError("identity_conflict no persistio el intake esperado.")
    created_ids.intake_request_ids.add(intake.id)
    if intake.processing_status != IntakeProcessingStatus.IDENTITY_CONFLICT.value:
        raise DemoExecutionError("identity_conflict no persistio IDENTITY_CONFLICT.")
    if intake.processing_details != {"reason": "curp_nss_conflict"}:
        raise DemoExecutionError("identity_conflict no guardo el motivo esperado.")

    customer_count = await load_customer_count_for_curp(session_factory, curp=payload["curp"])
    counts = await load_counts_for_execution(
        session_factory,
        markers=markers,
        customer_id=seeded_customer.id,
    )
    if customer_count != 1 or counts[0] != 1 or counts[2] != 1:
        raise DemoExecutionError("identity_conflict altero la cardinalidad esperada.")

    return ScenarioRecord(
        name="identity_conflict_same_curp_different_nss",
        outcome="HTTP 409 curp_nss_conflict",
        explanation="La API rechaza de forma controlada un NSS distinto para un CURP ya activo.",
        request_payload=payload,
        responses=[
            {
                "http_status": status_code,
                "x_request_id": request_id,
                **response_body,
            }
        ],
        persistence_summary={
            "seeded_customer_id": str(seeded_customer.id),
            "intake_request_id": str(intake.id),
            "intake_status": intake.processing_status,
            "processing_details": intake.processing_details,
            "customer_count_for_curp": customer_count,
            "bounded_counts": {
                "intakes_for_external_request": counts[0],
                "customers_for_seeded_customer_id": counts[1],
                "afore_relations_for_customer": counts[2],
            },
        },
    )


async def _run_validation_error_scenario(
    session_factory: async_sessionmaker[AsyncSession],
) -> ScenarioRecord:
    payload = build_named_payload(
        "validation_error",
        source="WRONG_SOURCE",
        curp="VALD900101HDFAB01",
        nss="12345678901",
    )
    markers = build_execution_markers({**payload, "source": "WRONG_SOURCE"})
    status_code, response_body, request_id = await _submit_http_request(payload)
    if status_code != 422:
        raise DemoExecutionError(f"validation_error esperaba HTTP 422 y recibio {status_code}.")
    if response_body != {
        "detail": {
            "code": "validation_error",
            "message": "The request payload is invalid.",
        }
    }:
        raise DemoExecutionError("validation_error no devolvio el cuerpo 422 esperado.")

    intake = await load_intake_by_markers(session_factory, markers=markers)
    if intake is not None:
        raise DemoExecutionError("validation_error no deberia persistir ningun intake.")

    return ScenarioRecord(
        name="validation_error_bad_source",
        outcome="HTTP 422 validation_error",
        explanation="La API rechaza el payload invalido y no deja filas nuevas en Neon.",
        request_payload=payload,
        responses=[
            {
                "http_status": status_code,
                "x_request_id": request_id,
                **response_body,
            }
        ],
        persistence_summary={
            "persisted_intake_for_external_request": False,
        },
    )


async def _run_already_active_replay_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload(
        "already_active_replay",
        nss="0011111111111111",
        name="Demo Already Active Replay Incoming",
        email="already-active-replay-incoming@example.test",
    )
    seeded_customer, seeded_relation = await seed_active_afore_customer(
        session_factory,
        curp=payload["curp"],
        nss=payload["nss"],
        name="Demo Existing Replay Customer",
        email="already-active-replay-existing@example.test",
    )
    created_ids.customer_ids.add(seeded_customer.id)
    created_ids.customer_service_ids.add(seeded_relation.id)

    markers = build_execution_markers(payload)
    first_status, first_body, first_request_id = await _submit_http_request(payload)
    replay_status, replay_body, replay_request_id = await _submit_http_request(payload)
    if first_status != 200 or replay_status != 200:
        raise DemoExecutionError("already_active_replay esperaba HTTP 200 en ambas ejecuciones.")
    if (
        first_body.get("status") != "ALREADY_ACTIVE"
        or replay_body.get("status") != "ALREADY_ACTIVE"
    ):
        raise DemoExecutionError(
            "already_active_replay no devolvio ALREADY_ACTIVE en ambas ejecuciones."
        )
    if first_body.get("replayed") is not False or replay_body.get("replayed") is not True:
        raise DemoExecutionError("already_active_replay no marco replayed correctamente.")
    if first_body["intake_request_id"] != replay_body["intake_request_id"]:
        raise DemoExecutionError("already_active_replay no reutilizo el mismo intake.")

    intake = await load_intake_by_markers(session_factory, markers=markers)
    if intake is None:
        raise DemoExecutionError("already_active_replay no persistio el intake esperado.")
    created_ids.intake_request_ids.add(intake.id)
    customer_count = await load_customer_count_for_curp(session_factory, curp=payload["curp"])
    counts = await load_counts_for_execution(
        session_factory,
        markers=markers,
        customer_id=seeded_customer.id,
    )
    if customer_count != 1 or counts != (1, 1, 1):
        raise DemoExecutionError("already_active_replay altero la cardinalidad esperada.")

    return ScenarioRecord(
        name="already_active_replay_same_external_request",
        outcome="HTTP 200 seguido de HTTP 200 replayed=true",
        explanation=(
            "La API también mantiene idempotencia cuando el resultado base es ALREADY_ACTIVE."
        ),
        request_payload=payload,
        responses=[
            {"http_status": first_status, "x_request_id": first_request_id, **first_body},
            {"http_status": replay_status, "x_request_id": replay_request_id, **replay_body},
        ],
        persistence_summary={
            "seeded_customer_id": str(seeded_customer.id),
            "intake_request_id": str(intake.id),
            "customer_count_for_curp": customer_count,
            "bounded_counts": {
                "intakes_for_external_request": counts[0],
                "customers_for_seeded_customer_id": counts[1],
                "afore_relations_for_customer": counts[2],
            },
        },
    )


async def _run_identity_conflict_replay_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload(
        "identity_conflict_replay",
        nss="0000000000000001",
        name="Demo Identity Conflict Replay Incoming",
        email="identity-conflict-replay-incoming@example.test",
    )
    seeded_customer, seeded_relation = await seed_active_afore_customer(
        session_factory,
        curp=payload["curp"],
        nss="0099999999999999",
        name="Demo Existing Conflict Replay Customer",
        email="identity-conflict-replay-existing@example.test",
    )
    created_ids.customer_ids.add(seeded_customer.id)
    created_ids.customer_service_ids.add(seeded_relation.id)

    replay_payload = dict(payload)
    replay_payload["nss"] = "1231231231231231"
    markers = build_execution_markers(payload)
    first_status, first_body, first_request_id = await _submit_http_request(payload)
    replay_status, replay_body, replay_request_id = await _submit_http_request(replay_payload)
    expected_error = {
        "detail": {
            "code": "curp_nss_conflict",
            "message": "The simulated intake flow could not reuse the existing customer safely.",
        }
    }
    if first_status != 409 or replay_status != 409:
        raise DemoExecutionError("identity_conflict_replay esperaba HTTP 409 en ambas ejecuciones.")
    if first_body != expected_error or replay_body != expected_error:
        raise DemoExecutionError("identity_conflict_replay no devolvio el error 409 esperado.")

    intake = await load_intake_by_markers(session_factory, markers=markers)
    if intake is None:
        raise DemoExecutionError("identity_conflict_replay no persistio el intake esperado.")
    created_ids.intake_request_ids.add(intake.id)
    customer_count = await load_customer_count_for_curp(session_factory, curp=payload["curp"])
    counts = await load_counts_for_execution(
        session_factory,
        markers=markers,
        customer_id=seeded_customer.id,
    )
    if customer_count != 1 or counts != (1, 1, 1):
        raise DemoExecutionError("identity_conflict_replay altero la cardinalidad esperada.")

    return ScenarioRecord(
        name="identity_conflict_replay_same_external_request",
        outcome="HTTP 409 seguido de HTTP 409 sin duplicados",
        explanation=(
            "El conflicto de identidad también queda fijado por idempotencia para la misma clave "
            "externa."
        ),
        request_payload=payload,
        responses=[
            {"http_status": first_status, "x_request_id": first_request_id, **first_body},
            {"http_status": replay_status, "x_request_id": replay_request_id, **replay_body},
        ],
        persistence_summary={
            "seeded_customer_id": str(seeded_customer.id),
            "intake_request_id": str(intake.id),
            "intake_status": intake.processing_status,
            "processing_details": intake.processing_details,
            "customer_count_for_curp": customer_count,
            "bounded_counts": {
                "intakes_for_external_request": counts[0],
                "customers_for_seeded_customer_id": counts[1],
                "afore_relations_for_customer": counts[2],
            },
        },
    )


async def _run_external_request_conflict_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload(
        "external_request_conflict",
        curp="PROC900101HDFAB03",
        nss="44444444444",
        name="Demo Processing Conflict Incoming",
        email="processing-conflict@example.test",
    )
    seeded_intake = await seed_processing_intake(session_factory, payload=payload)
    created_ids.intake_request_ids.add(seeded_intake.id)

    markers = build_execution_markers(payload)
    status_code, response_body, request_id = await _submit_http_request(payload)
    expected_error = {
        "detail": {
            "code": "external_request_conflict",
            "message": "The external request is already being processed in an incompatible state.",
        }
    }
    if status_code != 409:
        raise DemoExecutionError(
            f"external_request_conflict esperaba HTTP 409 y recibio {status_code}."
        )
    if response_body != expected_error:
        raise DemoExecutionError("external_request_conflict no devolvio el cuerpo esperado.")

    intake = await load_intake_by_markers(session_factory, markers=markers)
    if intake is None or intake.id != seeded_intake.id:
        raise DemoExecutionError("external_request_conflict no mantuvo el intake original.")

    return ScenarioRecord(
        name="external_request_conflict_processing_state",
        outcome="HTTP 409 external_request_conflict",
        explanation="Una clave externa ya en PROCESSING no puede reevaluarse ni duplicarse.",
        request_payload=payload,
        responses=[
            {
                "http_status": status_code,
                "x_request_id": request_id,
                **response_body,
            }
        ],
        persistence_summary={
            "intake_request_id": str(intake.id),
            "intake_status": intake.processing_status,
            "processing_details": intake.processing_details,
        },
    )


async def _run_validation_missing_email_scenario(
    session_factory: async_sessionmaker[AsyncSession],
) -> ScenarioRecord:
    payload = build_named_payload(
        "validation_missing_email",
        curp="MISS900101HDFAB04",
        nss="55555555555",
    )
    payload_without_email = dict(payload)
    payload_without_email.pop("email")
    markers = build_execution_markers(payload)
    status_code, response_body, request_id = await _submit_http_request(payload_without_email)
    if status_code != 422:
        raise DemoExecutionError(
            f"validation_missing_email esperaba HTTP 422 y recibio {status_code}."
        )
    if response_body != {
        "detail": {
            "code": "validation_error",
            "message": "The request payload is invalid.",
        }
    }:
        raise DemoExecutionError("validation_missing_email no devolvio el cuerpo 422 esperado.")
    intake = await load_intake_by_markers(session_factory, markers=markers)
    if intake is not None:
        raise DemoExecutionError("validation_missing_email no deberia persistir intake.")

    return ScenarioRecord(
        name="validation_error_missing_email",
        outcome="HTTP 422 validation_error",
        explanation="La API rechaza un request estructuralmente incompleto antes de crear intake.",
        request_payload=payload_without_email,
        responses=[
            {
                "http_status": status_code,
                "x_request_id": request_id,
                **response_body,
            }
        ],
        persistence_summary={"persisted_intake_for_external_request": False},
    )


async def _run_validation_extra_field_scenario(
    session_factory: async_sessionmaker[AsyncSession],
) -> ScenarioRecord:
    payload = build_named_payload(
        "validation_extra_field",
        curp="EXTR900101HDFAB05",
        nss="66666666666",
    )
    payload_with_extra = dict(payload)
    payload_with_extra["unexpected"] = True
    markers = build_execution_markers(payload)
    status_code, response_body, request_id = await _submit_http_request(payload_with_extra)
    if status_code != 422:
        raise DemoExecutionError(
            f"validation_extra_field esperaba HTTP 422 y recibio {status_code}."
        )
    if response_body != {
        "detail": {
            "code": "validation_error",
            "message": "The request payload is invalid.",
        }
    }:
        raise DemoExecutionError("validation_extra_field no devolvio el cuerpo 422 esperado.")
    intake = await load_intake_by_markers(session_factory, markers=markers)
    if intake is not None:
        raise DemoExecutionError("validation_extra_field no deberia persistir intake.")

    return ScenarioRecord(
        name="validation_error_extra_field",
        outcome="HTTP 422 validation_error",
        explanation="La API rechaza campos no soportados y evita contaminar la base.",
        request_payload=payload_with_extra,
        responses=[
            {
                "http_status": status_code,
                "x_request_id": request_id,
                **response_body,
            }
        ],
        persistence_summary={"persisted_intake_for_external_request": False},
    )


async def _run_validation_invalid_email_scenario(
    session_factory: async_sessionmaker[AsyncSession],
) -> ScenarioRecord:
    payload = build_named_payload(
        "validation_invalid_email",
        curp="MAIL900101HDFAB06",
        nss="77777777777",
    )
    payload_with_bad_email = dict(payload)
    payload_with_bad_email["email"] = "not-an-email"
    markers = build_execution_markers(payload)
    status_code, response_body, request_id = await _submit_http_request(payload_with_bad_email)
    if status_code != 422:
        raise DemoExecutionError(
            f"validation_invalid_email esperaba HTTP 422 y recibio {status_code}."
        )
    if response_body != {
        "detail": {
            "code": "validation_error",
            "message": "The request payload is invalid.",
        }
    }:
        raise DemoExecutionError("validation_invalid_email no devolvio el cuerpo 422 esperado.")
    intake = await load_intake_by_markers(session_factory, markers=markers)
    if intake is not None:
        raise DemoExecutionError("validation_invalid_email no deberia persistir intake.")

    return ScenarioRecord(
        name="validation_error_invalid_email",
        outcome="HTTP 422 validation_error",
        explanation="La API rechaza formatos de email inválidos en el borde HTTP.",
        request_payload=payload_with_bad_email,
        responses=[
            {
                "http_status": status_code,
                "x_request_id": request_id,
                **response_body,
            }
        ],
        persistence_summary={"persisted_intake_for_external_request": False},
    )


async def _run_seeded_not_approved_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload(
        "seeded_not_approved",
        curp="DNAP900101HDFAB07",
        nss="88888888888",
        name="Demo Seeded Not Approved",
        email="seeded-not-approved@example.test",
    )
    intake = await seed_terminal_intake_without_customer(
        session_factory,
        payload=payload,
        processing_status=IntakeProcessingStatus.NOT_APPROVED,
        processing_details={
            "reason": "demo_not_approved",
            "message": "Seeded demo status for non-approved intake visibility.",
        },
    )
    created_ids.intake_request_ids.add(intake.id)

    return ScenarioRecord(
        name="seeded_not_approved_intake",
        outcome="Seeded intake in NOT_APPROVED",
        explanation=(
            "Dato sembrado para mostrar un caso de rechazo funcional todavía no producido "
            "por la API actual."
        ),
        request_payload=payload,
        responses=[],
        persistence_summary={
            "intake_request_id": str(intake.id),
            "intake_status": intake.processing_status,
            "customer_id": None,
            "rewards_id": None,
            "processing_details": intake.processing_details,
        },
    )


async def _run_seeded_not_eligible_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload(
        "seeded_not_eligible",
        curp="DNEG900101HDFAB08",
        nss="99999999999",
        name="Demo Seeded Not Eligible",
        email="seeded-not-eligible@example.test",
    )
    intake = await seed_terminal_intake_without_customer(
        session_factory,
        payload=payload,
        processing_status=IntakeProcessingStatus.NOT_ELIGIBLE,
        processing_details={
            "reason": "demo_not_eligible",
            "message": "Seeded demo status for non-eligible intake visibility.",
        },
    )
    created_ids.intake_request_ids.add(intake.id)

    return ScenarioRecord(
        name="seeded_not_eligible_intake",
        outcome="Seeded intake in NOT_ELIGIBLE",
        explanation="Dato sembrado para ilustrar un cliente fuera del alcance funcional del MVP.",
        request_payload=payload,
        responses=[],
        persistence_summary={
            "intake_request_id": str(intake.id),
            "intake_status": intake.processing_status,
            "customer_id": None,
            "rewards_id": None,
            "processing_details": intake.processing_details,
        },
    )


async def _run_seeded_eligibility_pending_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload(
        "seeded_eligibility_pending",
        curp="DPEN900101HDFAB09",
        nss="12121212121",
        name="Demo Seeded Eligibility Pending",
        email="seeded-eligibility-pending@example.test",
    )
    intake = await seed_terminal_intake_without_customer(
        session_factory,
        payload=payload,
        processing_status=IntakeProcessingStatus.ELIGIBILITY_PENDING,
        processing_details={
            "reason": "demo_pending_review",
            "message": "Seeded demo status for pending eligibility visibility.",
        },
    )
    created_ids.intake_request_ids.add(intake.id)

    return ScenarioRecord(
        name="seeded_eligibility_pending_intake",
        outcome="Seeded intake in ELIGIBILITY_PENDING",
        explanation="Dato sembrado para mostrar un caso todavía pendiente de decisión funcional.",
        request_payload=payload,
        responses=[],
        persistence_summary={
            "intake_request_id": str(intake.id),
            "intake_status": intake.processing_status,
            "customer_id": None,
            "rewards_id": None,
            "processing_details": intake.processing_details,
        },
    )


async def _run_seeded_incomplete_scenario(
    session_factory: async_sessionmaker[AsyncSession],
    created_ids: CreatedRecordIds,
) -> ScenarioRecord:
    payload = build_named_payload(
        "seeded_incomplete",
        curp="DINC900101HDFAB10",
        nss="34343434343",
        name="Demo Seeded Incomplete",
        email="seeded-incomplete@example.test",
    )
    intake = await seed_terminal_intake_without_customer(
        session_factory,
        payload=payload,
        processing_status=IntakeProcessingStatus.INCOMPLETE,
        processing_details={
            "reason": "demo_missing_contact",
            "message": "Seeded demo status for incomplete intake visibility.",
        },
    )
    created_ids.intake_request_ids.add(intake.id)

    return ScenarioRecord(
        name="seeded_incomplete_intake",
        outcome="Seeded intake in INCOMPLETE",
        explanation="Dato sembrado para representar un caso detenido por información faltante.",
        request_payload=payload,
        responses=[],
        persistence_summary={
            "intake_request_id": str(intake.id),
            "intake_status": intake.processing_status,
            "customer_id": None,
            "rewards_id": None,
            "processing_details": intake.processing_details,
        },
    )


async def run_api_proof_demo(keep_data: bool) -> int:
    safe_environment = configure_demo_environment()
    created_ids = CreatedRecordIds()
    engine = create_async_engine(safe_environment.test_database_url, pool_pre_ping=True)
    session_factory = _build_session_factory(engine)

    try:
        _print_step(1, "Entorno")
        print("  ambiente seguro confirmado")
        print("  base de prueba confirmada")
        print("  objetivo: demostrar request, response y persistencia real de la API")

        _print_step(2, "Ejecucion de escenarios")
        scenario_records = [
            await _run_approved_scenario(session_factory, created_ids),
            await _run_approved_replay_scenario(session_factory, created_ids),
            await _run_already_active_scenario(session_factory, created_ids),
            await _run_already_active_replay_scenario(session_factory, created_ids),
            await _run_identity_conflict_scenario(session_factory, created_ids),
            await _run_identity_conflict_replay_scenario(session_factory, created_ids),
            await _run_external_request_conflict_scenario(session_factory, created_ids),
            await _run_validation_error_scenario(session_factory),
            await _run_validation_missing_email_scenario(session_factory),
            await _run_validation_extra_field_scenario(session_factory),
            await _run_validation_invalid_email_scenario(session_factory),
            await _run_seeded_not_approved_scenario(session_factory, created_ids),
            await _run_seeded_not_eligible_scenario(session_factory, created_ids),
            await _run_seeded_eligibility_pending_scenario(session_factory, created_ids),
            await _run_seeded_incomplete_scenario(session_factory, created_ids),
        ]
        for index, record in enumerate(scenario_records, start=1):
            _print_scenario_record(index, record)

        _print_step(3, "Resumen para demo")
        print("  approved_new_customer: prueba creacion completa")
        print("  approved_replay_same_external_request: prueba idempotencia")
        print("  already_active_existing_customer: prueba reutilizacion de cliente existente")
        print(
            "  already_active_replay_same_external_request: prueba replay sobre cliente ya activo"
        )
        print(
            "  identity_conflict_same_curp_different_nss: prueba rechazo controlado con "
            "rastro persistido"
        )
        print(
            "  identity_conflict_replay_same_external_request: prueba replay de conflicto "
            "sin duplicados"
        )
        print("  external_request_conflict_processing_state: prueba conflicto no replayable")
        print("  validation_error_bad_source: prueba rechazo estructural sin persistencia")
        print("  validation_error_missing_email: prueba campo requerido ausente")
        print("  validation_error_extra_field: prueba rechazo de campo no soportado")
        print("  validation_error_invalid_email: prueba formato de correo invalido")
        print("  seeded_not_approved_intake: dato sembrado para rechazo funcional visible")
        print("  seeded_not_eligible_intake: dato sembrado para no elegible visible")
        print("  seeded_eligibility_pending_intake: dato sembrado para revisión pendiente visible")
        print("  seeded_incomplete_intake: dato sembrado para información incompleta visible")

        _print_step(4, "Limpieza")
        if keep_data:
            print("  limpieza omitida por --keep-data")
            print("  quedaron datos sinteticos listos para mostrar en Neon")
            print(
                "  intake_request_ids="
                f"{sorted(str(value) for value in created_ids.intake_request_ids)}"
            )
            print(f"  customer_ids={sorted(str(value) for value in created_ids.customer_ids)}")
            print(
                "  customer_service_ids="
                f"{sorted(str(value) for value in created_ids.customer_service_ids)}"
            )
        else:
            remaining = await cleanup_created_records(session_factory, created_ids)
            if remaining != (0, 0, 0):
                raise DemoExecutionError("La limpieza no elimino todos los registros creados.")
            print("  registros sinteticos eliminados")
            print("  verificacion posterior a limpieza=sin residuos")

        print("DEMO API PROOF COMPLETADA")
        return 0
    finally:
        try:
            if not keep_data and not created_ids.is_empty():
                await cleanup_created_records(session_factory, created_ids)
        finally:
            await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if not args.allow_legacy:
            raise DemoConfigurationError(
                "La demo de intake es histórica; usa --allow-legacy solo para evidencia."
            )
        os.environ["LEGACY_CUSTOMER_INTAKE_ENABLED"] = "true"
        reset_settings_cache()
        if args.suite == "api-proof":
            return asyncio.run(run_api_proof_demo(keep_data=args.keep_data))
        return asyncio.run(run_single_approved_demo(keep_data=args.keep_data))
    except DemoConfigurationError as exc:
        print(f"ERROR DE CONFIGURACION: {exc}", file=sys.stderr)
        return 1
    except DemoExecutionError as exc:
        print(f"ERROR DE DEMO: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("ERROR: ejecucion interrumpida.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
