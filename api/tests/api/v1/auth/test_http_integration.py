from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.api.v1.auth.dependencies import get_customer_auth_service
from carobra_rewards.core.config import reset_settings_cache
from carobra_rewards.main import create_application
from carobra_rewards.modules.customer_auth.application.service import CustomerAuthService

NOW = datetime(2026, 7, 9, 23, 45, tzinfo=UTC)


class FixedRewardsIdGenerator:
    def __init__(self) -> None:
        self._next = 0

    def generate(self) -> str:
        self._next += 1
        return f"RWD-http-{self._next}"


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


@pytest.mark.integration
@pytest.mark.asyncio
async def test_customer_auth_http_flow_and_stable_errors(
    postgres_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("AUTH_SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("LEGACY_CUSTOMER_INTAKE_ENABLED", "false")
    reset_settings_cache()
    service = CustomerAuthService(
        postgres_session_factory,
        session_ttl=timedelta(days=7),
        rewards_id_generator=FixedRewardsIdGenerator(),
        clock=lambda: NOW,
    )
    app = create_application()
    app.dependency_overrides[get_customer_auth_service] = lambda: service

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        for path in ("/api/v1/me", "/api/v1/me/validation-status"):
            response = await client.get(path)
            assert response.status_code == 401
            assert response.json()["detail"]["code"] == "unauthenticated"

        missing_terms = await client.post(
            "/api/v1/auth/register",
            json={key: value for key, value in _payload().items() if key != "terms_accepted"},
        )
        assert missing_terms.status_code == 422
        assert missing_terms.json()["detail"]["code"] == "terms_not_accepted"

        mismatch = await client.post(
            "/api/v1/auth/register",
            json=_payload(confirm_password="different-password"),
        )
        assert mismatch.status_code == 422
        assert mismatch.json()["detail"]["code"] == "password_mismatch"

        registered = await client.post("/api/v1/auth/register", json=_payload())
        assert registered.status_code == 201
        assert registered.json()["customer"]["customer_status"] == "PENDING_VALIDATION"
        assert registered.json()["validation_status"] == "PENDING"

        duplicate_email = await client.post(
            "/api/v1/auth/register",
            json=_payload(curp="ZXCV123456HMNLRS11", email="ADA@example.com"),
        )
        assert duplicate_email.status_code == 409
        assert duplicate_email.json()["detail"]["code"] == "duplicate_email"

        duplicate_curp = await client.post(
            "/api/v1/auth/register",
            json=_payload(email="other@example.com"),
        )
        assert duplicate_curp.status_code == 409
        assert duplicate_curp.json()["detail"]["code"] == "duplicate_curp"

        invalid_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "ada@example.com", "password": "wrong-password"},
        )
        assert invalid_login.status_code == 401
        assert invalid_login.json()["detail"]["code"] == "invalid_credentials"

        logged_in = await client.post(
            "/api/v1/auth/login",
            json={"email": "ADA@example.com", "password": "correct-horse-7"},
        )
        assert logged_in.status_code == 200
        assert "HttpOnly" in logged_in.headers["set-cookie"]

        me = await client.get("/api/v1/me")
        validation = await client.get("/api/v1/me/validation-status")
        assert me.status_code == 200 and me.json()["email"] == "ada@example.com"
        assert validation.status_code == 200 and validation.json()["status"] == "PENDING"

        logged_out = await client.post("/api/v1/auth/logout")
        assert logged_out.status_code == 204
        assert (await client.get("/api/v1/me")).status_code == 401
