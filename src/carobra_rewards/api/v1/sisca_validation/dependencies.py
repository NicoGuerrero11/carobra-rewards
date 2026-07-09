from __future__ import annotations

from hmac import compare_digest
from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from carobra_rewards.core.config import Settings, get_settings
from carobra_rewards.infrastructure.database.session import get_session_factory
from carobra_rewards.modules.sisca_validation.application.service import (
    ExecuteSiscaValidationCheck,
    GetSiscaValidationStatus,
)
from carobra_rewards.modules.sisca_validation.infrastructure.gateways import (
    HttpSiscaValidationGateway,
    SimulatedSiscaValidationGateway,
)
from carobra_rewards.modules.sisca_validation.infrastructure.persistence.repositories import (
    SqlAlchemySiscaValidationUnitOfWork,
)
from carobra_rewards.modules.sisca_validation.ports.gateway import SiscaValidationGateway

_internal_api_key = APIKeyHeader(name="X-Internal-API-Key", auto_error=False)


def require_internal_api_key(
    provided: Annotated[str | None, Security(_internal_api_key)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    configured = settings.sisca_internal_api_token
    if configured is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "internal_auth_not_configured", "message": "Service unavailable"},
        )
    if provided is None or not compare_digest(provided, configured.get_secret_value()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthorized", "message": "Unauthorized"},
        )


def get_sisca_gateway(
    settings: Annotated[Settings, Depends(get_settings)],
) -> SiscaValidationGateway:
    if settings.sisca_adapter == "simulated":
        return SimulatedSiscaValidationGateway()
    if not settings.sisca_base_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "sisca_not_configured", "message": "Service unavailable"},
        )
    return HttpSiscaValidationGateway(
        base_url=settings.sisca_base_url,
        validation_path=settings.sisca_validation_path,
        timeout_seconds=settings.sisca_timeout_seconds,
        api_token=(
            None
            if settings.sisca_api_token is None
            else settings.sisca_api_token.get_secret_value()
        ),
    )


def get_execute_validation_check(
    settings: Annotated[Settings, Depends(get_settings)],
    gateway: Annotated[SiscaValidationGateway, Depends(get_sisca_gateway)],
) -> ExecuteSiscaValidationCheck:
    return ExecuteSiscaValidationCheck(
        unit_of_work=SqlAlchemySiscaValidationUnitOfWork(get_session_factory()),
        gateway=gateway,
        known_movement_types=settings.parsed_sisca_known_movement_types,
        allowed_movement_types=settings.parsed_sisca_allowed_movement_types,
        minimum_transfer_date=settings.sisca_minimum_transfer_date,
        max_retries=settings.sisca_max_retries,
    )


def get_validation_status_service() -> GetSiscaValidationStatus:
    return GetSiscaValidationStatus(SqlAlchemySiscaValidationUnitOfWork(get_session_factory()))
