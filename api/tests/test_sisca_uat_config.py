import pytest
from pydantic import SecretStr

from carobra_rewards.core.config import Settings


def test_uat_http_configuration_rejects_a_host_not_explicitly_approved_for_testing() -> None:
    settings = Settings(
        APP_ENV="uat",
        SISCA_ADAPTER="http",
        SISCA_BASE_URL="https://sisca-production.example.test/validations",
        SISCA_UAT_ALLOWED_HOSTS="sisca-uat.example.test",
    )

    with pytest.raises(ValueError, match="not approved by SISCA_UAT_ALLOWED_HOSTS"):
        settings.validate_sisca_http_configuration()


def test_uat_http_configuration_accepts_partner_production_host_with_test_secret() -> None:
    settings = Settings(
        APP_ENV="uat",
        SISCA_ADAPTER="http",
        SISCA_BASE_URL="https://sisca-production.example.test/validations",
        SISCA_UAT_ALLOWED_HOSTS="sisca-production.example.test",
        SISCA_API_TOKEN=SecretStr("must-not-be-used"),
        SISCA_UAT_API_TOKEN=SecretStr("uat-secret"),
    )

    settings.validate_sisca_http_configuration()

    assert settings.active_sisca_api_token is not None
    assert settings.active_sisca_api_token.get_secret_value() == "uat-secret"


def test_uat_http_configuration_requires_https_and_a_test_secret() -> None:
    insecure = Settings(
        APP_ENV="uat",
        SISCA_ADAPTER="http",
        SISCA_BASE_URL="http://sisca.example.test/validations",
        SISCA_UAT_ALLOWED_HOSTS="sisca.example.test",
        SISCA_UAT_API_TOKEN=SecretStr("uat-secret"),
    )
    without_secret = Settings(
        APP_ENV="uat",
        SISCA_ADAPTER="http",
        SISCA_BASE_URL="https://sisca.example.test/validations",
        SISCA_UAT_ALLOWED_HOSTS="sisca.example.test",
    )

    with pytest.raises(ValueError, match="must use HTTPS"):
        insecure.validate_sisca_http_configuration()
    with pytest.raises(ValueError, match="authentication secret"):
        without_secret.validate_sisca_http_configuration()
