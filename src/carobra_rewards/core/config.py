from datetime import date
from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

AppEnv = Literal["development", "test", "production"]
SiscaAdapter = Literal["simulated", "http"]


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
    sisca_adapter: SiscaAdapter = Field(default="simulated", alias="SISCA_ADAPTER")
    sisca_base_url: str | None = Field(default=None, alias="SISCA_BASE_URL")
    sisca_validation_path: str = Field(
        default="/validations",
        alias="SISCA_VALIDATION_PATH",
    )
    sisca_api_token: SecretStr | None = Field(default=None, alias="SISCA_API_TOKEN")
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
    sisca_known_movement_types: str = Field(
        default="Traspaso NAP,Registro NAP",
        alias="SISCA_KNOWN_MOVEMENT_TYPES",
    )
    sisca_allowed_movement_types: str = Field(
        default="Traspaso NAP,Registro NAP",
        alias="SISCA_ALLOWED_MOVEMENT_TYPES",
    )
    sisca_minimum_transfer_date: date | None = Field(
        default=None,
        alias="SISCA_MINIMUM_TRANSFER_DATE",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()


def _parse_csv_set(value: str) -> frozenset[str]:
    parsed = frozenset(item.strip() for item in value.split(",") if item.strip())
    if not parsed:
        raise ValueError("SISCA movement type configuration cannot be empty")
    return parsed
