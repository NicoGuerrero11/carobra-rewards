"""Translate customer intake application outcomes into HTTP-safe responses."""

from fastapi import HTTPException, status
from fastapi.responses import JSONResponse

from carobra_rewards.api.v1.customer_intake.schemas import CustomerIntakeErrorResponse
from carobra_rewards.modules.customer_intake.application.errors import (
    CurpNssConflict,
    CustomerServiceInconsistency,
    ExternalRequestConflict,
    IntakeMutationFailed,
    ProcessSimulatedCustomerIntakeError,
    RewardsIdCollisionExhausted,
    ServiceNotFound,
    SuccessfulIntakeInconsistency,
)
from carobra_rewards.modules.customer_intake.application.results import (
    SimulatedCustomerIntakeResult,
    SimulatedCustomerIntakeStatus,
)

CUSTOMER_INTAKE_PATH = "/api/v1/customers/intake"
VALIDATION_ERROR_CODE = "validation_error"
VALIDATION_ERROR_MESSAGE = "The request payload is invalid."
INTERNAL_ERROR_CODE = "internal_error"
INTERNAL_ERROR_MESSAGE = "The simulated intake flow failed unexpectedly."


def map_result_to_http_status(result: SimulatedCustomerIntakeResult) -> int:
    """Keep HTTP semantics in the API layer instead of the module."""
    if result.replayed or result.status is SimulatedCustomerIntakeStatus.ALREADY_ACTIVE:
        return status.HTTP_200_OK
    return status.HTTP_201_CREATED


def map_error_to_http_exception(error: ProcessSimulatedCustomerIntakeError) -> HTTPException:
    """Translate controlled application errors into HTTP-safe payloads."""
    if isinstance(error, ExternalRequestConflict):
        return _http_error(
            status.HTTP_409_CONFLICT,
            "external_request_conflict",
            "The external request is already being processed in an incompatible state.",
        )
    if isinstance(error, CurpNssConflict):
        return _http_error(
            status.HTTP_409_CONFLICT,
            "curp_nss_conflict",
            "The simulated intake flow could not reuse the existing customer safely.",
        )
    if isinstance(error, ServiceNotFound):
        return _http_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "service_not_found",
            "The simulated intake flow is temporarily unavailable.",
        )
    if isinstance(error, CustomerServiceInconsistency):
        return _http_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "customer_service_inconsistency",
            "The simulated intake flow could not reuse the existing customer safely.",
        )
    if isinstance(error, SuccessfulIntakeInconsistency):
        return _http_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "successful_intake_inconsistency",
            "The stored successful intake could not be replayed safely.",
        )
    if isinstance(error, RewardsIdCollisionExhausted):
        return _http_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "rewards_id_collision_exhausted",
            "The simulated intake flow could not allocate a Rewards ID.",
        )
    if isinstance(error, IntakeMutationFailed):
        return _http_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "intake_mutation_failed",
            "The simulated intake flow could not complete the required persistence updates.",
        )
    return _http_error(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        INTERNAL_ERROR_CODE,
        INTERNAL_ERROR_MESSAGE,
    )


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    payload = CustomerIntakeErrorResponse(code=code, message=message)
    return HTTPException(status_code=status_code, detail=payload.model_dump())


def build_validation_error_response() -> JSONResponse:
    """Return the documented generic 422 contract for intake payload validation."""
    payload = CustomerIntakeErrorResponse(
        code=VALIDATION_ERROR_CODE,
        message=VALIDATION_ERROR_MESSAGE,
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": payload.model_dump()},
    )


def build_unexpected_error_response() -> JSONResponse:
    """Return the documented generic 500 contract for unexpected intake failures."""
    payload = CustomerIntakeErrorResponse(
        code=INTERNAL_ERROR_CODE,
        message=INTERNAL_ERROR_MESSAGE,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": payload.model_dump()},
    )
