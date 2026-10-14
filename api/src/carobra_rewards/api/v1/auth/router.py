from __future__ import annotations

import asyncio
from time import monotonic
from typing import Annotated, Literal, NoReturn

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status

from carobra_rewards.api.v1.auth.dependencies import get_auth_admission, get_customer_auth_service
from carobra_rewards.api.v1.auth.schemas import (
    ERROR_RESPONSES,
    CustomerProfileResponse,
    CustomerValidationStatusResponse,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegistrationResponse,
)
from carobra_rewards.core.config import Settings, get_settings
from carobra_rewards.modules.customer_auth.application.models import (
    AuthAdmissionRejectedError,
    CustomerAuthPersistenceError,
    CustomerValidationNotFoundError,
    DuplicateCurpError,
    DuplicateEmailError,
    InvalidBirthDateError,
    InvalidCredentialsError,
    PasswordMismatchError,
    PasswordValidationError,
    RewardsIdCollisionExhaustedError,
    TermsNotAcceptedError,
    UnauthenticatedError,
)
from carobra_rewards.modules.customer_auth.application.service import CustomerAuthService
from carobra_rewards.modules.customer_auth.infrastructure.admission import AuthAdmission
from carobra_rewards.modules.customer_auth.infrastructure.diagnostics import log_auth_failure

router = APIRouter(tags=["customer-auth"])


@router.post(
    "/auth/register",
    status_code=status.HTTP_201_CREATED,
    response_model=RegistrationResponse,
    responses=ERROR_RESPONSES,
    summary="Register a Rewards customer",
)
async def register(
    request: RegisterRequest,
    connection: Request,
    admission: Annotated[AuthAdmission, Depends(get_auth_admission)],
    background_tasks: BackgroundTasks,
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[CustomerAuthService, Depends(get_customer_auth_service)],
) -> RegistrationResponse:
    started = monotonic()
    stage: Literal["admission", "login", "register"] = "admission"
    try:
        async with asyncio.timeout(settings.auth_request_timeout_seconds):
            await admission.admit("register", request.email, _connection_origin(connection))
            stage = "register"
            result = await service.register(request.to_command())
    except TimeoutError as exc:
        log_auth_failure(exc, stage=stage, started=started)
        _raise_http_error(AuthAdmissionRejectedError())
    except Exception as exc:
        if isinstance(exc, CustomerAuthPersistenceError):
            log_auth_failure(exc, stage=stage, started=started)
        _raise_http_error(exc)
    background_tasks.add_task(service.run_initial_validation, result)
    return RegistrationResponse.from_result(result)


@router.post(
    "/auth/login",
    response_model=LoginResponse,
    responses=ERROR_RESPONSES,
    summary="Log in with email and password",
)
async def login(
    request: LoginRequest,
    connection: Request,
    admission: Annotated[AuthAdmission, Depends(get_auth_admission)],
    response: Response,
    service: Annotated[CustomerAuthService, Depends(get_customer_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> LoginResponse:
    started = monotonic()
    stage: Literal["admission", "login", "register"] = "admission"
    try:
        async with asyncio.timeout(settings.auth_request_timeout_seconds):
            await admission.admit("login", request.email, _connection_origin(connection))
            stage = "login"
            result = await service.login(request.to_command())
    except TimeoutError as exc:
        log_auth_failure(exc, stage=stage, started=started)
        _raise_http_error(AuthAdmissionRejectedError())
    except Exception as exc:
        if isinstance(exc, CustomerAuthPersistenceError):
            log_auth_failure(exc, stage=stage, started=started)
        _raise_http_error(exc)
    response.set_cookie(
        key=settings.auth_session_cookie_name,
        value=result.session_token,
        max_age=settings.auth_session_ttl_hours * 60 * 60,
        expires=result.expires_at,
        path="/",
        domain=settings.auth_session_cookie_domain,
        secure=settings.auth_session_cookie_secure,
        httponly=True,
        samesite=settings.auth_session_cookie_samesite,
    )
    return LoginResponse(
        customer=CustomerProfileResponse.from_profile(result.customer),
        expires_at=result.expires_at,
    )


@router.post(
    "/auth/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=ERROR_RESPONSES,
    summary="Log out the current browser session",
)
async def logout(
    request: Request,
    response: Response,
    service: Annotated[CustomerAuthService, Depends(get_customer_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    try:
        await service.logout(request.cookies.get(settings.auth_session_cookie_name))
    except Exception as exc:
        _raise_http_error(exc)
    response.delete_cookie(
        key=settings.auth_session_cookie_name,
        path="/",
        domain=settings.auth_session_cookie_domain,
        secure=settings.auth_session_cookie_secure,
        httponly=True,
        samesite=settings.auth_session_cookie_samesite,
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get(
    "/me",
    response_model=CustomerProfileResponse,
    responses=ERROR_RESPONSES,
    summary="Get the authenticated customer profile",
)
async def get_me(
    request: Request,
    service: Annotated[CustomerAuthService, Depends(get_customer_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CustomerProfileResponse:
    try:
        profile = await service.get_current_customer(
            request.cookies.get(settings.auth_session_cookie_name)
        )
    except Exception as exc:
        _raise_http_error(exc)
    return CustomerProfileResponse.from_profile(profile)


@router.get(
    "/me/validation-status",
    response_model=CustomerValidationStatusResponse,
    responses=ERROR_RESPONSES,
    summary="Get the authenticated customer's SISCA validation status",
)
async def get_my_validation_status(
    request: Request,
    service: Annotated[CustomerAuthService, Depends(get_customer_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CustomerValidationStatusResponse:
    try:
        result = await service.get_validation_status(
            request.cookies.get(settings.auth_session_cookie_name)
        )
    except Exception as exc:
        _raise_http_error(exc)
    return CustomerValidationStatusResponse.from_result(result)


def _raise_http_error(exc: Exception) -> NoReturn:
    if isinstance(exc, AuthAdmissionRejectedError):
        raise HTTPException(
            status_code=429,
            detail={"code": "auth_rate_limited", "message": "Try again later"},
            headers={"Retry-After": str(exc.retry_after), "Cache-Control": "no-store"},
        ) from exc
    if isinstance(exc, DuplicateEmailError):
        raise _safe_error(409, "duplicate_email", "Email is already registered") from exc
    if isinstance(exc, DuplicateCurpError):
        raise _safe_error(409, "duplicate_curp", "CURP is already registered") from exc
    if isinstance(exc, RewardsIdCollisionExhaustedError):
        raise _safe_error(
            503,
            "rewards_id_collision_exhausted",
            "Could not allocate a Rewards ID",
        ) from exc
    if isinstance(exc, PasswordMismatchError):
        raise _safe_error(422, "password_mismatch", "Passwords do not match") from exc
    if isinstance(exc, InvalidBirthDateError):
        raise _safe_error(
            422, "invalid_birth_date", "Birth date must be a valid past or present date"
        ) from exc
    if isinstance(exc, TermsNotAcceptedError):
        raise _safe_error(422, "terms_not_accepted", "Terms must be accepted") from exc
    if isinstance(exc, PasswordValidationError):
        raise _safe_error(422, "invalid_password", "Password does not meet requirements") from exc
    if isinstance(exc, InvalidCredentialsError):
        raise _safe_error(401, "invalid_credentials", "Invalid credentials") from exc
    if isinstance(exc, UnauthenticatedError):
        raise _safe_error(401, "unauthenticated", "Authentication is required") from exc
    if isinstance(exc, CustomerValidationNotFoundError):
        raise _safe_error(404, "validation_not_found", "Validation not found") from exc
    if isinstance(exc, CustomerAuthPersistenceError):
        raise _safe_error(503, "service_unavailable", "Service unavailable") from exc
    raise exc


def _safe_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _connection_origin(request: Request) -> str:
    # The API server must run with --no-proxy-headers (see Dockerfile).
    # This is the TCP peer, often a shared Railway proxy, NOT the browser's IP.
    # Missing peer information shares one bucket; never trust a forwarded header.
    return request.client.host if request.client else "shared-unknown-peer"
