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
        SISCA_TRACE_IDENTIFIER="carobra-rewards-uat",
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


def test_uat_http_configuration_rejects_overlapping_status_categories() -> None:
    settings = Settings(
        APP_ENV="uat",
        SISCA_ADAPTER="http",
        SISCA_BASE_URL="https://sisca.example.test",
        SISCA_UAT_ALLOWED_HOSTS="sisca.example.test",
        SISCA_UAT_API_TOKEN=SecretStr("uat-secret"),
        SISCA_TRACE_IDENTIFIER="carobra-rewards-uat",
        SISCA_VALIDATED_STATUSES="Certificado",
        SISCA_PENDING_STATUSES=" certificado ",
    )

    with pytest.raises(ValueError, match="must not overlap"):
        settings.validate_sisca_http_configuration()


def test_confirmed_sisca_catalog_is_available_by_default() -> None:
    settings = Settings()

    assert "TRASPASO" in settings.parsed_sisca_known_movement_types
    assert "TRASPASO" in settings.parsed_sisca_allowed_movement_types
    assert "Certificado" in settings.parsed_sisca_validated_statuses


def test_uat_http_configuration_requires_rewards_trace_identifier() -> None:
    settings = Settings(
        APP_ENV="uat",
        SISCA_ADAPTER="http",
        SISCA_BASE_URL="https://sisca.example.test",
        SISCA_UAT_ALLOWED_HOSTS="sisca.example.test",
        SISCA_UAT_API_TOKEN=SecretStr("uat-secret"),
    )

    with pytest.raises(ValueError, match="SISCA_TRACE_IDENTIFIER"):
        settings.validate_sisca_http_configuration()


def test_uat_http_configuration_rejects_missing_custom_ca_file() -> None:
    settings = Settings(
        APP_ENV="uat",
        SISCA_ADAPTER="http",
        SISCA_BASE_URL="https://sisca.example.test",
        SISCA_UAT_ALLOWED_HOSTS="sisca.example.test",
        SISCA_UAT_API_TOKEN=SecretStr("uat-secret"),
        SISCA_TRACE_IDENTIFIER="carobra-rewards-uat",
        SISCA_CA_BUNDLE_PATH="/missing/ca.pem",
    )

    with pytest.raises(ValueError, match="readable CA certificate"):
        settings.validate_sisca_http_configuration()
