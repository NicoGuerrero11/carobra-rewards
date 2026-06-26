"""HTTP router for customer intake."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from carobra_rewards.api.v1.customer_intake.dependencies import get_process_customer_intake
from carobra_rewards.api.v1.customer_intake.error_mapping import (
    map_error_to_http_exception,
    map_result_to_http_status,
)
from carobra_rewards.api.v1.customer_intake.http_tracing import (
    CUSTOMER_INTAKE_REQUEST_ID_HEADER,
)
from carobra_rewards.api.v1.customer_intake.schemas import (
    CustomerIntakeErrorEnvelope,
    CustomerIntakeRequest,
    CustomerIntakeResponse,
)
from carobra_rewards.modules.customer_intake.application.errors import (
    ProcessSimulatedCustomerIntakeError,
)
from carobra_rewards.modules.customer_intake.application.service import (
    ProcessSimulatedCustomerIntake,
)

router = APIRouter(prefix="/customers/intake", tags=["customer-intake"])

_REQUEST_ID_RESPONSE_HEADER = {
    "description": "Opaque Rewards-generated UUID v4 for this HTTP execution.",
    "schema": {"type": "string", "format": "uuid"},
}


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=CustomerIntakeResponse,
    responses={
        200: {
            "model": CustomerIntakeResponse,
            "headers": {CUSTOMER_INTAKE_REQUEST_ID_HEADER: _REQUEST_ID_RESPONSE_HEADER},
        },
        201: {
            "model": CustomerIntakeResponse,
            "headers": {CUSTOMER_INTAKE_REQUEST_ID_HEADER: _REQUEST_ID_RESPONSE_HEADER},
        },
        409: {
            "model": CustomerIntakeErrorEnvelope,
            "headers": {CUSTOMER_INTAKE_REQUEST_ID_HEADER: _REQUEST_ID_RESPONSE_HEADER},
        },
        422: {
            "model": CustomerIntakeErrorEnvelope,
            "headers": {CUSTOMER_INTAKE_REQUEST_ID_HEADER: _REQUEST_ID_RESPONSE_HEADER},
        },
        500: {
            "model": CustomerIntakeErrorEnvelope,
            "headers": {CUSTOMER_INTAKE_REQUEST_ID_HEADER: _REQUEST_ID_RESPONSE_HEADER},
        },
    },
    summary="Process provisional simulated customer intake",
)
async def process_customer_intake(
    http_request: Request,
    request: CustomerIntakeRequest,
    response: Response,
    service: Annotated[ProcessSimulatedCustomerIntake, Depends(get_process_customer_intake)],
) -> CustomerIntakeResponse:
    """Process the functional but provisional simulated intake flow."""

    try:
        result = await service(request.to_command())
    except ProcessSimulatedCustomerIntakeError as exc:
        intake_request_id = getattr(exc, "intake_request_id", None)
        if intake_request_id is not None:
            http_request.state.intake_request_id = intake_request_id
        raise map_error_to_http_exception(exc) from exc

    http_request.state.intake_request_id = result.intake_request_id
    response.status_code = map_result_to_http_status(result)
    return CustomerIntakeResponse.from_result(result)
