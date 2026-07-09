import pytest

from carobra_rewards.core.config import reset_settings_cache


@pytest.fixture(autouse=True)
def enable_legacy_intake_for_historical_tests(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LEGACY_CUSTOMER_INTAKE_ENABLED", "true")
    reset_settings_cache()
    yield
    reset_settings_cache()
