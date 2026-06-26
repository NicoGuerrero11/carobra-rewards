from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Query
from fastapi.testclient import TestClient

from carobra_rewards.api.v1.customer_intake.dependencies import get_process_customer_intake
from carobra_rewards.main import create_application
from carobra_rewards.modules.customer_intake.application.errors import (
    CurpNssConflict,
    ExternalRequestConflict,
    ServiceNotFound,
)
from carobra_rewards.modules.customer_intake.application.results import (
    SimulatedCustomerIntakeResult,
    SimulatedCustomerIntakeStatus,
)


def _assert_valid_uuid(value: str) -> None:
    assert str(UUID(value)) == value


class StubService:
    async def __call__(self, command) -> SimulatedCustomerIntakeResult:
        return SimulatedCustomerIntakeResult(
            intake_request_id="intake-1",
            customer_id="customer-1",
            rewards_id="RWD-1",
            status=SimulatedCustomerIntakeStatus.APPROVED,
            replayed=False,
        )


class RaisingStubService:
    def __init__(self, error: Exception) -> None:
        self._error = error

    async def __call__(self, command) -> SimulatedCustomerIntakeResult:
        raise self._error


def test_customer_intake_route_is_registered_without_preview() -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: StubService()
    client = TestClient(app)

    response = client.post(
        "/api/v1/customers/intake",
        json={
            "source": "SISCA_SIMULATED",
            "external_request_id": "external-1",
            "curp": "  abcd123456hmnlrs09  ",
            "nss": "0012345678901234",
            "name": " Test User ",
            "email": "test@example.com",
            "phone": "5551234567",
            "postal_code": "01010",
        },
    )

    assert response.status_code == 201
    _assert_valid_uuid(response.headers["X-Request-ID"])
    assert response.json() == {
        "intake_request_id": "intake-1",
        "customer_id": "customer-1",
        "rewards_id": "RWD-1",
        "status": "APPROVED",
        "replayed": False,
    }

    preview_response = client.post("/api/v1/customers/intake/_preview", json={})
    assert preview_response.status_code == 404


def test_customer_intake_request_validation_rejects_invalid_payloads() -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: StubService()
    client = TestClient(app)

    responses = [
        client.post(
            "/api/v1/customers/intake",
            json={
                "source": "sisca_simulated",
                "external_request_id": "external-1",
                "curp": "ABCD123456HMNLRS09",
                "nss": "0012345678901234",
                "name": "Test User",
                "email": "test@example.com",
            },
        ),
        client.post(
            "/api/v1/customers/intake",
            json={
                "source": "SISCA_SIMULATED",
                "external_request_id": "external-1",
                "curp": "ABCD123456HMNLRS09",
                "nss": "0012345678901234",
                "name": "Test User",
            },
        ),
        client.post(
            "/api/v1/customers/intake",
            json={
                "source": "SISCA_SIMULATED",
                "external_request_id": "external-1",
                "curp": "ABCD123456HMNLRS09",
                "nss": "0012345678901234",
                "name": "Test User",
                "email": "test@example.com",
                "unexpected": True,
            },
        ),
    ]

    expected = {
        "detail": {
            "code": "validation_error",
            "message": "The request payload is invalid.",
        }
    }
    forbidden_fragments = ("loc", "msg", "type", "input", "ctx", "test@example.com")

    for response in responses:
        assert response.status_code == 422
        _assert_valid_uuid(response.headers["X-Request-ID"])
        assert response.json() == expected
        assert all(fragment not in response.text for fragment in forbidden_fragments)


def test_customer_intake_openapi_documents_shared_error_envelope() -> None:
    app = create_application()
    client = TestClient(app)

    openapi = client.get("/openapi.json")

    assert openapi.status_code == 200
    operation = openapi.json()["paths"]["/api/v1/customers/intake"]["post"]
    responses = operation["responses"]
    expected_ref = "#/components/schemas/CustomerIntakeErrorEnvelope"
    request_id_header = {
        "description": "Opaque Rewards-generated UUID v4 for this HTTP execution.",
        "schema": {"type": "string", "format": "uuid"},
    }

    assert responses["200"]["headers"]["X-Request-ID"] == request_id_header
    assert responses["201"]["headers"]["X-Request-ID"] == request_id_header
    assert responses["409"]["content"]["application/json"]["schema"]["$ref"] == expected_ref
    assert responses["409"]["headers"]["X-Request-ID"] == request_id_header
    assert responses["422"]["content"]["application/json"]["schema"]["$ref"] == expected_ref
    assert responses["422"]["headers"]["X-Request-ID"] == request_id_header
    assert responses["500"]["content"]["application/json"]["schema"]["$ref"] == expected_ref
    assert responses["500"]["headers"]["X-Request-ID"] == request_id_header


def test_customer_intake_returns_documented_409_error_envelope() -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: RaisingStubService(
        ExternalRequestConflict()
    )
    client = TestClient(app)

    response = client.post(
        "/api/v1/customers/intake",
        json={
            "source": "SISCA_SIMULATED",
            "external_request_id": "external-1",
            "curp": "ABCD123456HMNLRS09",
            "nss": "0012345678901234",
            "name": "Test User",
            "email": "test@example.com",
        },
    )

    assert response.status_code == 409
    _assert_valid_uuid(response.headers["X-Request-ID"])
    assert response.json() == {
        "detail": {
            "code": "external_request_conflict",
            "message": "The external request is already being processed in an incompatible state.",
        }
    }
    assert "detail.detail" not in response.text


def test_customer_intake_returns_documented_curp_nss_conflict_409_error_envelope() -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: RaisingStubService(
        CurpNssConflict()
    )
    client = TestClient(app)

    response = client.post(
        "/api/v1/customers/intake",
        json={
            "source": "SISCA_SIMULATED",
            "external_request_id": "external-1",
            "curp": "ABCD123456HMNLRS09",
            "nss": "0012345678901234",
            "name": "Test User",
            "email": "test@example.com",
        },
    )

    assert response.status_code == 409
    _assert_valid_uuid(response.headers["X-Request-ID"])
    assert response.json() == {
        "detail": {
            "code": "curp_nss_conflict",
            "message": "The simulated intake flow could not reuse the existing customer safely.",
        }
    }
    assert "detail.detail" not in response.text


def test_customer_intake_returns_documented_500_error_envelope_without_leaks() -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: RaisingStubService(
        ServiceNotFound()
    )
    client = TestClient(app)

    response = client.post(
        "/api/v1/customers/intake",
        json={
            "source": "SISCA_SIMULATED",
            "external_request_id": "external-1",
            "curp": "ABCD123456HMNLRS09",
            "nss": "0012345678901234",
            "name": "Test User",
            "email": "test@example.com",
        },
    )

    assert response.status_code == 500
    _assert_valid_uuid(response.headers["X-Request-ID"])
    assert response.json() == {
        "detail": {
            "code": "service_not_found",
            "message": "The simulated intake flow is temporarily unavailable.",
        }
    }
    forbidden_fragments = (
        "ABCD123456HMNLRS09",
        "0012345678901234",
        "test@example.com",
        "traceback",
        "sqlalchemy",
        "postgres",
    )
    assert all(fragment not in response.text for fragment in forbidden_fragments)


def test_non_intake_route_keeps_standard_fastapi_validation_contract() -> None:
    app = create_application()

    @app.get("/api/v1/test-validation")
    async def test_validation_route(limit: Annotated[int, Query()]) -> dict[str, int]:
        return {"limit": limit}

    client = TestClient(app)

    response = client.get("/api/v1/test-validation", params={"limit": "not-an-int"})

    assert response.status_code == 422
    body = response.json()
    assert isinstance(body["detail"], list)
    assert body["detail"][0]["loc"] == ["query", "limit"]
    assert body["detail"][0]["type"]
    assert body["detail"][0]["msg"]


def test_application_keeps_health_outside_versioned_routes() -> None:
    app = create_application()
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
