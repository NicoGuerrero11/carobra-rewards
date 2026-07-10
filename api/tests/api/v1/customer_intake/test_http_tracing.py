from __future__ import annotations

import logging
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from carobra_rewards.api.v1.customer_intake.dependencies import get_process_customer_intake
from carobra_rewards.api.v1.customer_intake.http_tracing import CUSTOMER_INTAKE_HTTP_EVENT
from carobra_rewards.main import create_application
from carobra_rewards.modules.customer_intake.application.results import (
    SimulatedCustomerIntakeResult,
    SimulatedCustomerIntakeStatus,
)

_STANDARD_LOG_RECORD_KEYS = frozenset(logging.makeLogRecord({}).__dict__)


def _assert_valid_uuid(value: str) -> None:
    assert str(UUID(value)) == value


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "external_request_id": "external-1",
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
    }
    payload.update(overrides)
    return payload


def _event_payload(record: logging.LogRecord) -> dict[str, object]:
    return {
        key: value
        for key, value in record.__dict__.items()
        if key not in _STANDARD_LOG_RECORD_KEYS and key != "message"
    }


class FixedResultService:
    def __init__(self, result: SimulatedCustomerIntakeResult) -> None:
        self._result = result

    async def __call__(self, command) -> SimulatedCustomerIntakeResult:
        return self._result


def test_customer_intake_logs_single_safe_event_for_success(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: FixedResultService(
        SimulatedCustomerIntakeResult(
            intake_request_id="intake-1",
            customer_id="customer-1",
            rewards_id="RWD-1",
            status=SimulatedCustomerIntakeStatus.ACCEPTED,
            replayed=False,
        )
    )
    client = TestClient(app)

    with caplog.at_level(
        logging.INFO,
        logger="carobra_rewards.api.v1.customer_intake.http_tracing",
    ):
        response = client.post("/api/v1/customers/intake", json=_payload())

    assert response.status_code == 201
    _assert_valid_uuid(response.headers["X-Request-ID"])
    records = [
        record
        for record in caplog.records
        if getattr(record, "event", None) == CUSTOMER_INTAKE_HTTP_EVENT
    ]
    assert len(records) == 1
    payload = _event_payload(records[0])
    assert payload["path"] == "/api/v1/customers/intake"
    assert payload["status_code"] == 201
    assert payload["intake_request_id"] == "intake-1"
    assert "external_request_id" not in str(payload)


def test_customer_intake_validation_logs_without_intake_request_id(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: FixedResultService(
        SimulatedCustomerIntakeResult(
            intake_request_id="unused",
            customer_id="unused",
            rewards_id="unused",
            status=SimulatedCustomerIntakeStatus.ACCEPTED,
            replayed=False,
        )
    )
    client = TestClient(app)

    with caplog.at_level(
        logging.INFO,
        logger="carobra_rewards.api.v1.customer_intake.http_tracing",
    ):
        response = client.post("/api/v1/customers/intake", json=_payload(correo_electronico=None))

    assert response.status_code == 422
    records = [
        record
        for record in caplog.records
        if getattr(record, "event", None) == CUSTOMER_INTAKE_HTTP_EVENT
    ]
    assert len(records) == 1
    assert "intake_request_id" not in _event_payload(records[0])
