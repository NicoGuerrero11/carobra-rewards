from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

AppEnv = Literal["development", "test", "uat", "production"]
SiscaAdapter = Literal["simulated", "http"]
SiscaAuthMode = Literal["bearer", "api_key"]
SiscaResponseFormat = Literal["canonical", "business_envelope"]
CookieSameSite = Literal["lax", "strict", "none"]


class Settings(BaseSettings):
    app_name: str = Field(default="Carobra Rewards", alias="APP_NAME")
    app_env: AppEnv = Field(default="development", alias="APP_ENV")
    app_debug: bool = Field(default=False, alias="APP_DEBUG")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    database_url: SecretStr | None = Field(default=None, alias="DATABASE_URL")
    test_database_url: SecretStr | None = Field(default=None, alias="TEST_DATABASE_URL")
    customer_intake_mvp_start_date: date | None = Field(
        default=None,
        alias="CUSTOMER_INTAKE_MVP_START_DATE",
    )
    legacy_customer_intake_enabled: bool = Field(
        default=False,
        alias="LEGACY_CUSTOMER_INTAKE_ENABLED",
    )
    auth_session_cookie_name: str = Field(
        default="carobra_session",
        alias="AUTH_SESSION_COOKIE_NAME",
    )
    auth_session_ttl_hours: int = Field(
        default=168,
        ge=1,
        le=24 * 90,
        alias="AUTH_SESSION_TTL_HOURS",
    )
    auth_session_cookie_secure: bool = Field(
        default=False,
        alias="AUTH_SESSION_COOKIE_SECURE",
    )
    auth_session_cookie_samesite: CookieSameSite = Field(
        default="lax",
        alias="AUTH_SESSION_COOKIE_SAME_SITE",
    )
    auth_session_cookie_domain: str | None = Field(
        default=None,
        alias="AUTH_SESSION_COOKIE_DOMAIN",
    )
    cors_allowed_origins: str = Field(
        default="http://127.0.0.1:4321,http://localhost:4321",
        alias="CORS_ALLOWED_ORIGINS",
    )
    sisca_adapter: SiscaAdapter = Field(default="simulated", alias="SISCA_ADAPTER")
    sisca_base_url: str | None = Field(default=None, alias="SISCA_BASE_URL")
    sisca_validation_path: str = Field(
        default="/validations",
        alias="SISCA_VALIDATION_PATH",
    )
    sisca_auth_mode: SiscaAuthMode = Field(default="api_key", alias="SISCA_AUTH_MODE")
    sisca_api_key_header: str = Field(default="X-API-Key", alias="SISCA_API_KEY_HEADER")
    sisca_response_format: SiscaResponseFormat = Field(
        default="business_envelope",
        alias="SISCA_RESPONSE_FORMAT",
    )
    sisca_trace_identifier: str | None = Field(
        default=None,
        alias="SISCA_TRACE_IDENTIFIER",
    )
    sisca_trace_identifier_header: str = Field(
        default="X-Rewards-Id",
        alias="SISCA_TRACE_IDENTIFIER_HEADER",
    )
    sisca_api_token: SecretStr | None = Field(default=None, alias="SISCA_API_TOKEN")
    sisca_uat_api_token: SecretStr | None = Field(
        default=None,
        alias="SISCA_UAT_API_TOKEN",
    )
    sisca_production_api_token: SecretStr | None = Field(
        default=None,
        alias="SISCA_PRODUCTION_API_TOKEN",
    )
    sisca_uat_allowed_hosts: str = Field(default="", alias="SISCA_UAT_ALLOWED_HOSTS")
    sisca_ca_bundle_path: str | None = Field(
        default=None,
        alias="SISCA_CA_BUNDLE_PATH",
    )
    sisca_production_allowed_hosts: str = Field(
        default="",
        alias="SISCA_PRODUCTION_ALLOWED_HOSTS",
    )
    sisca_uat_control_enabled: bool = Field(
        default=False,
        alias="SISCA_UAT_CONTROL_ENABLED",
    )
    sisca_uat_authorized_operators: str = Field(
        default="",
        alias="SISCA_UAT_AUTHORIZED_OPERATORS",
    )
    sisca_internal_api_token: SecretStr | None = Field(
        default=None,
        alias="SISCA_INTERNAL_API_TOKEN",
    )
    sisca_timeout_seconds: float = Field(
        default=5.0,
        gt=0,
        alias="SISCA_TIMEOUT_SECONDS",
    )
    sisca_max_retries: int = Field(default=2, ge=0, le=10, alias="SISCA_MAX_RETRIES")
    sisca_scheduler_enabled: bool = Field(
        default=False,
        alias="SISCA_SCHEDULER_ENABLED",
    )
    sisca_scheduler_poll_seconds: float = Field(
        default=60.0,
        ge=5.0,
        le=3600.0,
        alias="SISCA_SCHEDULER_POLL_SECONDS",
    )
    sisca_scheduler_batch_size: int = Field(
        default=100,
        ge=1,
        le=1000,
        alias="SISCA_SCHEDULER_BATCH_SIZE",
    )
    sisca_known_movement_types: str = Field(
        default="TRASPASO,Traspaso NAP,Registro NAP",
        alias="SISCA_KNOWN_MOVEMENT_TYPES",
    )
    sisca_allowed_movement_types: str = Field(
        default="TRASPASO",
        alias="SISCA_ALLOWED_MOVEMENT_TYPES",
    )
    sisca_validated_statuses: str = Field(
        default="Certificado,Aceptada Procesar",
        alias="SISCA_VALIDATED_STATUSES",
    )
    sisca_pending_statuses: str = Field(
        default="Aceptada Operaciones",
        alias="SISCA_PENDING_STATUSES",
    )
    sisca_cancelled_statuses: str = Field(
        default="Cancelada",
        alias="SISCA_CANCELLED_STATUSES",
    )
    sisca_minimum_transfer_date: date | None = Field(
        default=None,
        alias="SISCA_MINIMUM_TRANSFER_DATE",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def is_docs_enabled(self) -> bool:
        return self.app_env != "production"

    @property
    def parsed_sisca_known_movement_types(self) -> frozenset[str]:
        return _parse_csv_set(self.sisca_known_movement_types)

    @property
    def parsed_sisca_allowed_movement_types(self) -> frozenset[str]:
        return _parse_csv_set(self.sisca_allowed_movement_types)

    @property
    def parsed_sisca_validated_statuses(self) -> frozenset[str]:
        return _parse_csv_set(self.sisca_validated_statuses)

    @property
    def parsed_sisca_pending_statuses(self) -> frozenset[str]:
        return _parse_csv_set(self.sisca_pending_statuses, required=False)

    @property
    def parsed_sisca_cancelled_statuses(self) -> frozenset[str]:
        return _parse_csv_set(self.sisca_cancelled_statuses, required=False)

    @property
    def parsed_sisca_uat_allowed_hosts(self) -> frozenset[str]:
        return frozenset(
            host.lower() for host in _parse_csv_set(self.sisca_uat_allowed_hosts, required=False)
        )

    @property
    def parsed_sisca_production_allowed_hosts(self) -> frozenset[str]:
        return frozenset(
            host.lower()
            for host in _parse_csv_set(self.sisca_production_allowed_hosts, required=False)
        )

    @property
    def parsed_sisca_uat_authorized_operators(self) -> frozenset[str]:
        return _parse_csv_set(self.sisca_uat_authorized_operators, required=False)

    @property
    def active_sisca_api_token(self) -> SecretStr | None:
        if self.app_env == "uat":
            return self.sisca_uat_api_token
        if self.app_env == "production":
            return self.sisca_production_api_token
        return self.sisca_api_token

    def validate_sisca_http_configuration(self) -> None:
        if self.sisca_adapter != "http":
            return
        if not self.sisca_base_url:
            raise ValueError("SISCA_BASE_URL must be configured for SISCA HTTP mode")
        parsed_url = urlparse(self.sisca_base_url)
        hostname = parsed_url.hostname
        if not hostname:
            raise ValueError("SISCA_BASE_URL must contain a host")
        if self.app_env in {"uat", "production"} and parsed_url.scheme != "https":
            raise ValueError("SISCA_BASE_URL must use HTTPS outside local environments")
        allowed_hosts: frozenset[str] | None = None
        allowed_hosts_key = ""
        if self.app_env == "uat":
            allowed_hosts = self.parsed_sisca_uat_allowed_hosts
            allowed_hosts_key = "SISCA_UAT_ALLOWED_HOSTS"
        elif self.app_env == "production":
            allowed_hosts = self.parsed_sisca_production_allowed_hosts
            allowed_hosts_key = "SISCA_PRODUCTION_ALLOWED_HOSTS"
        if allowed_hosts is not None:
            if not allowed_hosts:
                raise ValueError(f"{allowed_hosts_key} must be configured for SISCA HTTP mode")
            if hostname.lower() not in allowed_hosts:
                raise ValueError(f"SISCA_BASE_URL host is not approved by {allowed_hosts_key}")
        if self.active_sisca_api_token is None:
            raise ValueError("An environment-specific SISCA authentication secret is required")
        if self.sisca_trace_identifier is None or not self.sisca_trace_identifier.strip():
            raise ValueError("SISCA_TRACE_IDENTIFIER must be configured for SISCA HTTP mode")
        if self.sisca_ca_bundle_path is not None and not Path(self.sisca_ca_bundle_path).is_file():
            raise ValueError("SISCA_CA_BUNDLE_PATH must reference a readable CA certificate file")
        _validate_http_header_name(self.sisca_api_key_header, key="SISCA_API_KEY_HEADER")
        _validate_http_header_name(
            self.sisca_trace_identifier_header,
            key="SISCA_TRACE_IDENTIFIER_HEADER",
        )
        _validate_sisca_status_catalog(
            validated=self.parsed_sisca_validated_statuses,
            pending=self.parsed_sisca_pending_statuses,
            cancelled=self.parsed_sisca_cancelled_statuses,
        )

    @property
    def parsed_cors_allowed_origins(self) -> tuple[str, ...]:
        origins = tuple(
            origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()
        )
        if not origins:
            raise ValueError("CORS_ALLOWED_ORIGINS cannot be empty")
        if "*" in origins:
            raise ValueError("CORS_ALLOWED_ORIGINS cannot contain '*' when credentials are enabled")
        return origins


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()


def _parse_csv_set(value: str, *, required: bool = True) -> frozenset[str]:
    parsed = frozenset(item.strip() for item in value.split(",") if item.strip())
    if required and not parsed:
        raise ValueError("SISCA movement type configuration cannot be empty")
    return parsed


def _validate_sisca_status_catalog(
    *,
    validated: frozenset[str],
    pending: frozenset[str],
    cancelled: frozenset[str],
) -> None:
    normalized = [
        {" ".join(value.strip().upper().split()) for value in category}
        for category in (validated, pending, cancelled)
    ]
    if any(normalized[index] & normalized[other] for index in range(3) for other in range(index)):
        raise ValueError("SISCA status categories must not overlap")


def _validate_http_header_name(value: str, *, key: str) -> None:
    normalized = value.replace("-", "")
    if not value or not normalized.isascii() or not normalized.isalnum():
        raise ValueError(f"{key} must contain only ASCII letters, numbers and hyphens")
