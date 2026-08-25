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
_uat_operator = APIKeyHeader(name="X-SISCA-UAT-Operator", auto_error=False)


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


def require_uat_control_operator(
    provided: Annotated[str | None, Security(_uat_operator)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    if settings.app_env != "uat" or not settings.sisca_uat_control_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "uat_control_unavailable", "message": "Operation unavailable"},
        )
    operator = "" if provided is None else provided.strip()
    if not operator or operator not in settings.parsed_sisca_uat_authorized_operators:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "uat_operator_unauthorized", "message": "Operation unavailable"},
        )
    return operator


def get_sisca_gateway(
    settings: Annotated[Settings, Depends(get_settings)],
) -> SiscaValidationGateway:
    if settings.sisca_adapter == "simulated":
        return SimulatedSiscaValidationGateway()
    try:
        settings.validate_sisca_http_configuration()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "sisca_not_configured", "message": "Service unavailable"},
        ) from exc
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
            if settings.active_sisca_api_token is None
            else settings.active_sisca_api_token.get_secret_value()
        ),
        auth_mode=settings.sisca_auth_mode,
        api_key_header=settings.sisca_api_key_header,
        response_format=settings.sisca_response_format,
        trace_identifier=settings.sisca_trace_identifier,
        trace_identifier_header=settings.sisca_trace_identifier_header,
        ca_bundle_path=settings.sisca_ca_bundle_path,
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
        validated_statuses=settings.parsed_sisca_validated_statuses,
        pending_statuses=settings.parsed_sisca_pending_statuses,
        cancelled_statuses=settings.parsed_sisca_cancelled_statuses,
    )


def get_validation_status_service() -> GetSiscaValidationStatus:
    return GetSiscaValidationStatus(SqlAlchemySiscaValidationUnitOfWork(get_session_factory()))
