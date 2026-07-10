from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from carobra_rewards.api.v1.auth.dependencies import get_customer_auth_service
from carobra_rewards.core.config import reset_settings_cache
from carobra_rewards.main import create_application
from carobra_rewards.modules.customer_auth.application.models import (
    CustomerProfile,
    CustomerValidationStatus,
    DuplicateCurpError,
    DuplicateEmailError,
    InvalidCredentialsError,
    LoginResult,
    PasswordMismatchError,
    RegistrationResult,
    RewardsIdCollisionExhaustedError,
    TermsNotAcceptedError,
    UnauthenticatedError,
)

CUSTOMER_ID = UUID("00000000-0000-0000-0000-000000000301")
VALIDATION_ID = UUID("00000000-0000-0000-0000-000000000302")
NOW = datetime(2026, 7, 9, 23, 30, tzinfo=UTC)


def _profile() -> CustomerProfile:
    return CustomerProfile(
        id=CUSTOMER_ID,
        rewards_id="RWD-test",
        curp="ABCD123456HMNLRS09",
        first_name="Ada",
        last_name="Lovelace",
        email="ada@example.com",
        phone="5551234567",
        postal_code="01010",
        state="CDMX",
        city="Ciudad de Mexico",
        customer_status="PENDING_VALIDATION",
        onboarding_status="COMPLETED",
    )


class FakeAuthService:
    error: Exception | None = None
    logout_token: str | None = None

    async def register(self, command):
        if self.error:
            raise self.error
        return RegistrationResult(_profile(), VALIDATION_ID, "PENDING")

    async def login(self, command):
        if self.error:
            raise self.error
        return LoginResult(_profile(), "browser-secret", NOW)

    async def logout(self, token):
        if self.error:
            raise self.error
        self.logout_token = token

    async def get_current_customer(self, token):
        if self.error:
            raise self.error
        if not token:
            raise UnauthenticatedError()
        return _profile()

    async def get_validation_status(self, token):
        if self.error:
            raise self.error
        if not token:
            raise UnauthenticatedError()
        return CustomerValidationStatus(
            validation_id=VALIDATION_ID,
            customer_id=CUSTOMER_ID,
            status="PENDING",
            registered_at=NOW,
            next_checkpoint="H24",
            next_checkpoint_at=NOW,
            last_checked_at=None,
            last_check_outcome=None,
        )


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "curp": "ABCD123456HMNLRS09",
        "first_name": "Ada",
        "last_name": "Lovelace",
        "email": "ada@example.com",
        "phone": "5551234567",
        "password": "correct-horse-7",
        "confirm_password": "correct-horse-7",
        "postal_code": "01010",
        "state": "CDMX",
        "city": "Ciudad de Mexico",
        "terms_accepted": True,
        "terms_version": "2026-07",
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> tuple[TestClient, FakeAuthService]:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("AUTH_SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("LEGACY_CUSTOMER_INTAKE_ENABLED", "false")
    reset_settings_cache()
    service = FakeAuthService()
    app = create_application()
    app.dependency_overrides[get_customer_auth_service] = lambda: service
    return TestClient(app), service


def test_register_login_logout_me_and_validation_status_contract(
    client: tuple[TestClient, FakeAuthService],
) -> None:
    http, service = client

    registered = http.post("/api/v1/auth/register", json=_payload())
    assert registered.status_code == 201
    assert registered.json()["validation_status"] == "PENDING"

    logged_in = http.post(
        "/api/v1/auth/login",
        json={"email": "ada@example.com", "password": "correct-horse-7"},
    )
    assert logged_in.status_code == 200
    cookie = logged_in.headers["set-cookie"]
    assert "carobra_session=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "browser-secret" not in logged_in.text
    assert "password" not in logged_in.text.lower()

    assert http.get("/api/v1/me").status_code == 200
    status_response = http.get("/api/v1/me/validation-status")
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "PENDING"
    assert "password" not in status_response.text.lower()

    logged_out = http.post("/api/v1/auth/logout")
    assert logged_out.status_code == 204
    assert service.logout_token == "browser-secret"
    assert "Max-Age=0" in logged_out.headers["set-cookie"]


@pytest.mark.parametrize(
    ("path", "error", "status_code", "code"),
    [
        ("/api/v1/auth/register", DuplicateEmailError(), 409, "duplicate_email"),
        ("/api/v1/auth/register", DuplicateCurpError(), 409, "duplicate_curp"),
        (
            "/api/v1/auth/register",
            RewardsIdCollisionExhaustedError(),
            503,
            "rewards_id_collision_exhausted",
        ),
        ("/api/v1/auth/register", PasswordMismatchError(), 422, "password_mismatch"),
        ("/api/v1/auth/register", TermsNotAcceptedError(), 422, "terms_not_accepted"),
        ("/api/v1/auth/login", InvalidCredentialsError(), 401, "invalid_credentials"),
    ],
)
def test_stable_auth_errors(
    client: tuple[TestClient, FakeAuthService],
    path: str,
    error: Exception,
    status_code: int,
    code: str,
) -> None:
    http, service = client
    service.error = error
    payload = (
        _payload()
        if path.endswith("register")
        else {"email": "ada@example.com", "password": "wrong-password"}
    )

    response = http.post(path, json=payload)

    assert response.status_code == status_code
    assert response.json()["detail"]["code"] == code


@pytest.mark.parametrize("path", ["/api/v1/me", "/api/v1/me/validation-status"])
def test_profile_reads_require_authentication(
    client: tuple[TestClient, FakeAuthService],
    path: str,
) -> None:
    http, _ = client

    response = http.get(path)

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthenticated"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("curp", "                  "),
        ("first_name", " "),
        ("email", "abc"),
        ("phone", " "),
        ("postal_code", " "),
        ("state", " "),
        ("city", " "),
    ],
)
def test_registration_rejects_invalid_or_blank_identity_fields(
    client: tuple[TestClient, FakeAuthService],
    field: str,
    value: str,
) -> None:
    http, _ = client

    response = http.post("/api/v1/auth/register", json=_payload(**{field: value}))

    assert response.status_code == 422


def test_cookie_attributes_are_environment_configurable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("AUTH_SESSION_COOKIE_SECURE", "true")
    monkeypatch.setenv("AUTH_SESSION_COOKIE_SAME_SITE", "strict")
    monkeypatch.setenv("AUTH_SESSION_COOKIE_DOMAIN", "example.test")
    reset_settings_cache()
    service = FakeAuthService()
    app = create_application()
    app.dependency_overrides[get_customer_auth_service] = lambda: service

    response = TestClient(app).post(
        "/api/v1/auth/login",
        json={"email": "ada@example.com", "password": "correct-horse-7"},
    )

    cookie = response.headers["set-cookie"]
    assert "Domain=example.test" in cookie
    assert "SameSite=strict" in cookie
    assert "Secure" in cookie
    reset_settings_cache()


def test_openapi_exposes_canonical_auth_and_hides_legacy_intake(
    client: tuple[TestClient, FakeAuthService],
) -> None:
    http, _ = client

    openapi = http.get("/openapi.json").json()

    for path in (
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/me",
        "/api/v1/me/validation-status",
    ):
        assert path in openapi["paths"]
    assert "/api/v1/customers/intake" not in openapi["paths"]
    assert {tag["name"] for tag in openapi["tags"]} >= {
        "customer-auth",
        "legacy-customer-intake",
    }
