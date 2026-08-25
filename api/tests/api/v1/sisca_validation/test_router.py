from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi.testclient import TestClient

from carobra_rewards.api.v1.sisca_validation.dependencies import (
    get_execute_validation_check,
    get_validation_status_service,
)
from carobra_rewards.core.config import reset_settings_cache
from carobra_rewards.main import create_application
from carobra_rewards.modules.sisca_validation.application.models import (
    ValidationExecutionResult,
    ValidationStatusResult,
)
from carobra_rewards.modules.sisca_validation.domain.models import (
    ValidationCheckOutcome,
    ValidationCheckpoint,
    ValidationStatus,
)

VALIDATION_ID = UUID("00000000-0000-0000-0000-000000000201")
CUSTOMER_ID = UUID("00000000-0000-0000-0000-000000000202")
NOW = datetime(2026, 7, 9, tzinfo=UTC)


class FakeExecuteService:
    last_command = None

    async def __call__(self, command):
        FakeExecuteService.last_command = command
        return ValidationExecutionResult(
            validation_id=command.validation_id,
            status=ValidationStatus.PENDING,
            outcome=ValidationCheckOutcome.NO_INFORMATION,
            next_checkpoint=ValidationCheckpoint.D3,
            next_checkpoint_at=NOW,
            replayed=False,
            stale=False,
            attempts=1,
        )


class FakeStatusService:
    async def __call__(self, customer_id):
        return ValidationStatusResult(
            validation_id=VALIDATION_ID,
            customer_id=customer_id,
            status=ValidationStatus.PENDING,
            registered_at=NOW,
            next_checkpoint=ValidationCheckpoint.H24,
            next_checkpoint_at=NOW,
            last_checked_at=None,
            last_check_outcome=None,
        )


def _client(monkeypatch) -> TestClient:
    monkeypatch.setenv("LEGACY_CUSTOMER_INTAKE_ENABLED", "false")
    monkeypatch.setenv("SISCA_INTERNAL_API_TOKEN", "test-secret")
    FakeExecuteService.last_command = None
    reset_settings_cache()
    app = create_application()
    app.dependency_overrides[get_execute_validation_check] = FakeExecuteService
    app.dependency_overrides[get_validation_status_service] = FakeStatusService
    return TestClient(app)


def test_openapi_exposes_validation_and_hides_legacy_intake(monkeypatch) -> None:
    client = _client(monkeypatch)

    openapi = client.get("/openapi.json").json()

    assert "/api/v1/internal/sisca-validations/{validation_id}/checks" in openapi["paths"]
    assert "/api/v1/customers/{customer_id}/validation-status" in openapi["paths"]
    assert "/api/v1/customers/intake" not in openapi["paths"]
    assert client.post("/api/v1/customers/intake", json={}).status_code == 404


def test_internal_check_requires_api_key(monkeypatch) -> None:
    client = _client(monkeypatch)

    response = client.post(
        f"/api/v1/internal/sisca-validations/{VALIDATION_ID}/checks",
        json={"mode": "scheduled", "checkpoint": "H24"},
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthorized"


def test_internal_check_returns_safe_result(monkeypatch) -> None:
    client = _client(monkeypatch)

    response = client.post(
        f"/api/v1/internal/sisca-validations/{VALIDATION_ID}/checks",
        headers={"X-Internal-API-Key": "test-secret"},
        json={"mode": "scheduled", "checkpoint": "H24"},
    )

    assert response.status_code == 200
    assert response.json()["outcome"] == "NO_INFORMATION"
    assert "curp" not in response.text.lower()


def test_invalid_check_body_uses_safe_error(monkeypatch) -> None:
    client = _client(monkeypatch)

    response = client.post(
        f"/api/v1/internal/sisca-validations/{VALIDATION_ID}/checks",
        headers={"X-Internal-API-Key": "test-secret"},
        json={"mode": "manual", "checkpoint": "D5"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": {"code": "validation_error", "message": "Request validation failed"}
    }


def test_status_response_excludes_sensitive_fields(monkeypatch) -> None:
    client = _client(monkeypatch)

    response = client.get(
        f"/api/v1/customers/{CUSTOMER_ID}/validation-status",
        headers={"X-Internal-API-Key": "test-secret"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "PENDING"
    assert "curp" not in response.text.lower()


def test_status_requires_internal_api_key(monkeypatch) -> None:
    client = _client(monkeypatch)

    response = client.get(f"/api/v1/customers/{CUSTOMER_ID}/validation-status")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthorized"


def test_controlled_uat_checkpoint_requires_uat_runtime(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SISCA_UAT_CONTROL_ENABLED", "true")
    monkeypatch.setenv("SISCA_UAT_AUTHORIZED_OPERATORS", "uat-operator-1")
    client = _client(monkeypatch)

    response = client.post(
        f"/api/v1/internal/sisca-validations/{VALIDATION_ID}/uat-controlled-checks",
        headers={"X-Internal-API-Key": "test-secret", "X-SISCA-UAT-Operator": "uat-operator-1"},
        json={"checkpoint": "H24"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "uat_control_unavailable"


def test_controlled_uat_checkpoint_requires_authorized_operator(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "uat")
    monkeypatch.setenv("SISCA_UAT_CONTROL_ENABLED", "true")
    monkeypatch.setenv("SISCA_UAT_AUTHORIZED_OPERATORS", "uat-operator-1")
    client = _client(monkeypatch)

    response = client.post(
        f"/api/v1/internal/sisca-validations/{VALIDATION_ID}/uat-controlled-checks",
        headers={"X-Internal-API-Key": "test-secret", "X-SISCA-UAT-Operator": "not-allowed"},
        json={"checkpoint": "H24"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "uat_operator_unauthorized"


def test_controlled_uat_checkpoint_passes_authorized_operator_to_service(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "uat")
    monkeypatch.setenv("SISCA_UAT_CONTROL_ENABLED", "true")
    monkeypatch.setenv("SISCA_UAT_AUTHORIZED_OPERATORS", "uat-operator-1")
    client = _client(monkeypatch)

    response = client.post(
        f"/api/v1/internal/sisca-validations/{VALIDATION_ID}/uat-controlled-checks",
        headers={"X-Internal-API-Key": "test-secret", "X-SISCA-UAT-Operator": "uat-operator-1"},
        json={"checkpoint": "D3"},
    )

    assert response.status_code == 200
    assert FakeExecuteService.last_command is not None
    assert FakeExecuteService.last_command.controlled_uat is True
    assert FakeExecuteService.last_command.operator_id == "uat-operator-1"
