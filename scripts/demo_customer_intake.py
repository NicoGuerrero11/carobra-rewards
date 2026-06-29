from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from dataclasses import dataclass, field
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
from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    CustomerIntakeRequestModel,
    CustomerModel,
    CustomerServiceModel,
    ServiceModel,
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
        return not (
            self.intake_request_ids or self.customer_ids or self.customer_service_ids
        )


@dataclass(slots=True, frozen=True)
class PersistedSnapshot:
    intake: CustomerIntakeRequestModel
    customer: CustomerModel
    customer_service: CustomerServiceModel
    service: ServiceModel


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Demuestra el alta provisional SISCA_SIMULATED -> Rewards "
            "usando el endpoint real."
        ),
    )
    parser.add_argument(
        "--keep-data",
        action="store_true",
        help="Conserva los registros sinteticos creados por esta ejecucion.",
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


async def _submit_request(payload: dict[str, str]) -> tuple[dict[str, object], str]:
    from carobra_rewards.main import create_application

    CustomerIntakeRequest.model_validate(payload)
    app = create_application()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(CUSTOMER_INTAKE_PATH, json=payload)

    if response.status_code != 201:
        raise DemoExecutionError(f"Se esperaba HTTP 201 y se obtuvo {response.status_code}.")

    request_id = response.headers.get("X-Request-ID")
    if request_id is None:
        raise DemoExecutionError("La respuesta no incluyo X-Request-ID.")
    _validate_uuid(request_id, field_name="X-Request-ID")

    body = response.json()
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
            select(func.count()).select_from(CustomerIntakeRequestModel).where(
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
            delete(CustomerModel).where(
                CustomerModel.id.in_(tuple(created_ids.customer_ids))
            )
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
            select(func.count()).select_from(CustomerIntakeRequestModel).where(
                CustomerIntakeRequestModel.id.in_(tuple(created_ids.intake_request_ids))
            )
        )
        remaining_customers = await verification_session.scalar(
            select(func.count()).select_from(CustomerModel).where(
                CustomerModel.id.in_(tuple(created_ids.customer_ids))
            )
        )
        remaining_relations = await verification_session.scalar(
            select(func.count()).select_from(CustomerServiceModel).where(
                CustomerServiceModel.id.in_(tuple(created_ids.customer_service_ids))
            )
        )

    return remaining_intakes or 0, remaining_customers or 0, remaining_relations or 0


def _print_step(step_number: int, title: str) -> None:
    print(f"Paso {step_number}. {title}")


async def run_demo(keep_data: bool) -> int:
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


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        return asyncio.run(run_demo(keep_data=args.keep_data))
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
