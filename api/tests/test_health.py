import pytest
from fastapi.testclient import TestClient

from carobra_rewards.core.config import reset_settings_cache
from carobra_rewards.main import create_application


def test_application_starts() -> None:
    app = create_application()

    assert app.title == "Carobra Rewards"


def test_scheduler_is_disabled_by_default() -> None:
    app = create_application()

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200


def test_health_endpoint_returns_ok() -> None:
    app = create_application()
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_allows_only_configured_credentialed_origins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "http://site.example")
    reset_settings_cache()
    client = TestClient(create_application())

    allowed = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://site.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    blocked = client.get("/health", headers={"Origin": "http://other.example"})

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://site.example"
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert "access-control-allow-origin" not in blocked.headers
    reset_settings_cache()


def test_cors_rejects_a_wildcard_origin_with_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "*")
    reset_settings_cache()

    with pytest.raises(ValueError, match="cannot contain"):
        create_application()

    reset_settings_cache()
