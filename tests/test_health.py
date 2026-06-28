from fastapi.testclient import TestClient

from carobra_rewards.main import create_application


def test_application_starts() -> None:
    app = create_application()

    assert app.title == "Carobra Rewards"


def test_health_endpoint_returns_ok() -> None:
    app = create_application()
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
