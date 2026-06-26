from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

import pytest
from fastapi import Query
from fastapi.testclient import TestClient

from carobra_rewards.api.v1.customer_intake.dependencies import get_process_customer_intake
from carobra_rewards.api.v1.customer_intake.http_tracing import CUSTOMER_INTAKE_HTTP_EVENT
from carobra_rewards.main import create_application
from carobra_rewards.modules.customer_intake.application.errors import (
    CurpNssConflict,
    ExternalRequestConflict,
)
from carobra_rewards.modules.customer_intake.application.results import (
    SimulatedCustomerIntakeResult,
    SimulatedCustomerIntakeStatus,
)

_STANDARD_LOG_RECORD_KEYS = frozenset(logging.makeLogRecord({}).__dict__)
_FORBIDDEN_LOG_FRAGMENTS = (
    "original_payload",
    "external_request_id",
    "abcd123456hmnlrs09",
    "0012345678901234",
    "test@example.com",
    "5551234567",
    "detail.message",
    "sql",
    "credential",
)


def _payload() -> dict[str, str]:
    return {
        "source": "SISCA_SIMULATED",
        "external_request_id": "external-1",
        "curp": "ABCD123456HMNLRS09",
        "nss": "0012345678901234",
        "name": "Test User",
        "email": "test@example.com",
    }


def _assert_valid_uuid(value: str) -> None:
    assert str(UUID(value)) == value


def _customer_intake_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [
        record
        for record in caplog.records
        if getattr(record, "event", None) == CUSTOMER_INTAKE_HTTP_EVENT
    ]


def _custom_record_fields(record: logging.LogRecord) -> dict[str, object]:
    return {
        key: value
        for key, value in record.__dict__.items()
        if key not in _STANDARD_LOG_RECORD_KEYS
    }


def _event_payload(record: logging.LogRecord) -> dict[str, object]:
    payload = _custom_record_fields(record)
    payload.pop("message", None)
    return payload


class FixedResultService:
    def __init__(self, result: SimulatedCustomerIntakeResult) -> None:
        self._result = result

    async def __call__(self, command) -> SimulatedCustomerIntakeResult:
        return self._result


class ReplayService:
    async def __call__(self, command) -> SimulatedCustomerIntakeResult:
        return SimulatedCustomerIntakeResult(
            intake_request_id="intake-replay",
            customer_id="customer-1",
            rewards_id="RWD-1",
            status=SimulatedCustomerIntakeStatus.APPROVED,
            replayed=True,
        )


class RaisingService:
    def __init__(self, error: Exception) -> None:
        self._error = error

    async def __call__(self, command) -> SimulatedCustomerIntakeResult:
        raise self._error


class CountingService:
    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self, command) -> SimulatedCustomerIntakeResult:
        self.calls += 1
        return SimulatedCustomerIntakeResult(
            intake_request_id="intake-unused",
            customer_id="customer-unused",
            rewards_id="RWD-unused",
            status=SimulatedCustomerIntakeStatus.APPROVED,
            replayed=False,
        )


def test_customer_intake_response_headers_and_single_info_log(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: FixedResultService(
        SimulatedCustomerIntakeResult(
            intake_request_id="intake-201",
            customer_id="customer-1",
            rewards_id="RWD-1",
            status=SimulatedCustomerIntakeStatus.APPROVED,
            replayed=False,
        )
    )
    client = TestClient(app)

    with caplog.at_level(logging.INFO):
        response = client.post("/api/v1/customers/intake", json=_payload())

    assert response.status_code == 201
    _assert_valid_uuid(response.headers["X-Request-ID"])
    assert response.json() == {
        "intake_request_id": "intake-201",
        "customer_id": "customer-1",
        "rewards_id": "RWD-1",
        "status": "APPROVED",
        "replayed": False,
    }

    records = _customer_intake_records(caplog)
    assert len(records) == 1
    record = records[0]
    duration_ms = _event_payload(record)["duration_ms"]
    assert record.levelno == logging.INFO
    assert _event_payload(record) == {
        "event": CUSTOMER_INTAKE_HTTP_EVENT,
        "request_id": response.headers["X-Request-ID"],
        "method": "POST",
        "path": "/api/v1/customers/intake",
        "status_code": 201,
        "duration_ms": duration_ms,
        "intake_request_id": "intake-201",
    }
    assert isinstance(duration_ms, int)
    assert duration_ms >= 0
    assert all(
        fragment not in str(_event_payload(record)).lower()
        for fragment in _FORBIDDEN_LOG_FRAGMENTS
    )


def test_customer_intake_replay_gets_new_request_id_and_same_intake_id(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: ReplayService()
    client = TestClient(app)

    with caplog.at_level(logging.INFO):
        first = client.post("/api/v1/customers/intake", json=_payload())
        second = client.post(
            "/api/v1/customers/intake",
            json=_payload(),
            headers={"X-Request-ID": "caller-supplied"},
        )

    assert first.status_code == 200
    assert second.status_code == 200
    _assert_valid_uuid(first.headers["X-Request-ID"])
    _assert_valid_uuid(second.headers["X-Request-ID"])
    assert second.headers["X-Request-ID"] != "caller-supplied"
    assert first.headers["X-Request-ID"] != second.headers["X-Request-ID"]
    assert (
        first.json()["intake_request_id"]
        == second.json()["intake_request_id"]
        == "intake-replay"
    )

    records = _customer_intake_records(caplog)
    assert len(records) == 2
    assert all(record.levelno == logging.INFO for record in records)
    assert [
        _event_payload(record)["intake_request_id"] for record in records
    ] == ["intake-replay", "intake-replay"]


def test_customer_intake_validation_rejects_before_service_and_logs_without_intake_id(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_application()
    service = CountingService()
    app.dependency_overrides[get_process_customer_intake] = lambda: service
    client = TestClient(app)

    with caplog.at_level(logging.INFO):
        response = client.post(
            "/api/v1/customers/intake",
            json={
                "source": "SISCA_SIMULATED",
                "external_request_id": "external-1",
                "curp": "ABCD123456HMNLRS09",
                "nss": "0012345678901234",
                "name": "Test User",
            },
        )

    assert response.status_code == 422
    _assert_valid_uuid(response.headers["X-Request-ID"])
    assert response.json() == {
        "detail": {
            "code": "validation_error",
            "message": "The request payload is invalid.",
        }
    }
    assert service.calls == 0

    records = _customer_intake_records(caplog)
    assert len(records) == 1
    record = records[0]
    assert record.levelno == logging.INFO
    assert "intake_request_id" not in _event_payload(record)


def test_customer_intake_conflicts_and_controlled_500_keep_header_and_body(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_application()
    client = TestClient(app)

    app.dependency_overrides[get_process_customer_intake] = lambda: RaisingService(
        CurpNssConflict(intake_request_id="intake-conflict")
    )
    with caplog.at_level(logging.INFO):
        conflict = client.post("/api/v1/customers/intake", json=_payload())

    assert conflict.status_code == 409
    _assert_valid_uuid(conflict.headers["X-Request-ID"])
    assert conflict.json() == {
        "detail": {
            "code": "curp_nss_conflict",
            "message": "The simulated intake flow could not reuse the existing customer safely.",
        }
    }

    conflict_records = _customer_intake_records(caplog)
    assert len(conflict_records) == 1
    assert conflict_records[0].levelno == logging.INFO
    assert _event_payload(conflict_records[0])["intake_request_id"] == "intake-conflict"

    caplog.clear()
    app.dependency_overrides[get_process_customer_intake] = lambda: RaisingService(
        ExternalRequestConflict()
    )
    with caplog.at_level(logging.INFO):
        external_conflict = client.post("/api/v1/customers/intake", json=_payload())

    assert external_conflict.status_code == 409
    _assert_valid_uuid(external_conflict.headers["X-Request-ID"])
    assert external_conflict.json() == {
        "detail": {
            "code": "external_request_conflict",
            "message": "The external request is already being processed in an incompatible state.",
        }
    }
    external_records = _customer_intake_records(caplog)
    assert len(external_records) == 1
    assert "intake_request_id" not in _event_payload(external_records[0])

    caplog.clear()
    app.dependency_overrides[get_process_customer_intake] = lambda: RaisingService(
        RuntimeError("boom")
    )
    with caplog.at_level(logging.INFO):
        unexpected = client.post("/api/v1/customers/intake", json=_payload())

    assert unexpected.status_code == 500
    _assert_valid_uuid(unexpected.headers["X-Request-ID"])
    assert unexpected.json() == {
        "detail": {
            "code": "internal_error",
            "message": "The simulated intake flow failed unexpectedly.",
        }
    }
    unexpected_records = _customer_intake_records(caplog)
    assert len(unexpected_records) == 1
    assert unexpected_records[0].levelno == logging.ERROR
    assert _event_payload(unexpected_records[0])["request_id"] == unexpected.headers[
        "X-Request-ID"
    ]


def test_non_intake_route_keeps_contract_without_header_or_event(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_application()

    @app.get("/api/v1/test-validation")
    async def test_validation_route(limit: Annotated[int, Query()]) -> dict[str, int]:
        return {"limit": limit}

    client = TestClient(app)

    with caplog.at_level(logging.INFO):
        response = client.get("/api/v1/test-validation", params={"limit": "not-an-int"})

    assert response.status_code == 422
    assert "X-Request-ID" not in response.headers
    assert _customer_intake_records(caplog) == []
