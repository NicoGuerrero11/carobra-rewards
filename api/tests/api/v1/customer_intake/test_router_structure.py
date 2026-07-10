from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient

from carobra_rewards.api.v1.customer_intake.dependencies import get_process_customer_intake
from carobra_rewards.main import create_application
from carobra_rewards.modules.customer_intake.application.errors import (
    CurpNssConflict,
    MvpStartDateNotConfigured,
)
from carobra_rewards.modules.customer_intake.application.results import (
    SimulatedCustomerIntakeResult,
    SimulatedCustomerIntakeStatus,
)


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


class StubService:
    async def __call__(self, command) -> SimulatedCustomerIntakeResult:
        return SimulatedCustomerIntakeResult(
            intake_request_id="intake-1",
            customer_id="customer-1",
            rewards_id="RWD-1",
            status=SimulatedCustomerIntakeStatus.ACCEPTED,
            replayed=False,
        )


class RaisingStubService:
    def __init__(self, error: Exception) -> None:
        self._error = error

    async def __call__(self, command) -> SimulatedCustomerIntakeResult:
        raise self._error


def test_customer_intake_route_uses_existing_endpoint_path() -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: StubService()
    client = TestClient(app)

    response = client.post("/api/v1/customers/intake", json=_payload())

    assert response.status_code == 201
    _assert_valid_uuid(response.headers["X-Request-ID"])
    assert response.json() == {
        "intake_request_id": "intake-1",
        "customer_id": "customer-1",
        "rewards_id": "RWD-1",
        "status": "accepted",
        "replayed": False,
    }


def test_customer_intake_request_validation_rejects_missing_required_fields() -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: StubService()
    client = TestClient(app)

    response = client.post(
        "/api/v1/customers/intake",
        json=_payload(correo_electronico=None),
    )

    assert response.status_code == 422
    _assert_valid_uuid(response.headers["X-Request-ID"])
    assert response.json() == {
        "detail": {
            "code": "structurally_invalid",
            "message": "The intake payload is structurally invalid.",
        }
    }


def test_customer_intake_openapi_documents_shared_error_envelope() -> None:
    app = create_application()
    client = TestClient(app)

    openapi = client.get("/openapi.json")

    assert openapi.status_code == 200
    operation = openapi.json()["paths"]["/api/v1/customers/intake"]["post"]
    responses = operation["responses"]
    expected_ref = "#/components/schemas/CustomerIntakeErrorEnvelope"

    assert responses["422"]["content"]["application/json"]["schema"]["$ref"] == expected_ref
    assert responses["500"]["content"]["application/json"]["schema"]["$ref"] == expected_ref


def test_customer_intake_returns_documented_identity_conflict_envelope() -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: RaisingStubService(
        CurpNssConflict()
    )
    client = TestClient(app)

    response = client.post("/api/v1/customers/intake", json=_payload())

    assert response.status_code == 409
    assert response.json() == {
        "detail": {
            "code": "curp_nss_conflict",
            "message": "The intake could not reconcile CURP and NSS with a single SISCA identity.",
        }
    }


def test_customer_intake_returns_documented_configuration_incomplete_envelope() -> None:
    app = create_application()
    app.dependency_overrides[get_process_customer_intake] = lambda: RaisingStubService(
        MvpStartDateNotConfigured()
    )
    client = TestClient(app)

    response = client.post("/api/v1/customers/intake", json=_payload())

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "configuration_incomplete",
            "message": "The intake eligibility configuration is incomplete.",
        }
    }
