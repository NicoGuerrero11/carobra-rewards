from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from carobra_rewards.api.v1.sisca_validation.dependencies import (
    get_execute_validation_check,
    get_validation_status_service,
    require_internal_api_key,
)
from carobra_rewards.api.v1.sisca_validation.schemas import (
    ExecuteValidationCheckRequest,
    ValidationErrorEnvelope,
    ValidationExecutionResponse,
    ValidationStatusResponse,
)
from carobra_rewards.modules.sisca_validation.application.models import (
    ExecuteValidationCheckCommand,
    ValidationCheckpointMismatchError,
    ValidationCheckpointNotDueError,
    ValidationNotFoundError,
)
from carobra_rewards.modules.sisca_validation.application.service import (
    ExecuteSiscaValidationCheck,
    GetSiscaValidationStatus,
)

router = APIRouter(tags=["sisca-validation"])

_errors: dict[int | str, dict[str, Any]] = {
    401: {"model": ValidationErrorEnvelope},
    404: {"model": ValidationErrorEnvelope},
    409: {"model": ValidationErrorEnvelope},
    422: {"model": ValidationErrorEnvelope},
    503: {"model": ValidationErrorEnvelope},
}


@router.post(
    "/internal/sisca-validations/{validation_id}/checks",
    response_model=ValidationExecutionResponse,
    responses=_errors,
    dependencies=[Depends(require_internal_api_key)],
)
async def execute_validation_check(
    validation_id: UUID,
    request: ExecuteValidationCheckRequest,
    service: Annotated[ExecuteSiscaValidationCheck, Depends(get_execute_validation_check)],
) -> ValidationExecutionResponse:
    try:
        result = await service(
            ExecuteValidationCheckCommand(
                validation_id=validation_id,
                checkpoint=request.checkpoint,
                manual=request.mode == "manual",
            )
        )
    except ValidationNotFoundError as exc:
        raise _safe_error(404, "validation_not_found", "Validation not found") from exc
    except ValidationCheckpointNotDueError as exc:
        raise _safe_error(409, "checkpoint_not_due", "Checkpoint is not due") from exc
    except ValidationCheckpointMismatchError as exc:
        raise _safe_error(409, "checkpoint_mismatch", "Checkpoint is not current") from exc
    return ValidationExecutionResponse.from_result(result)


@router.get(
    "/customers/{customer_id}/validation-status",
    response_model=ValidationStatusResponse,
    responses=_errors,
    dependencies=[Depends(require_internal_api_key)],
)
async def get_validation_status(
    customer_id: UUID,
    service: Annotated[GetSiscaValidationStatus, Depends(get_validation_status_service)],
) -> ValidationStatusResponse:
    try:
        result = await service(customer_id)
    except ValidationNotFoundError as exc:
        raise _safe_error(404, "validation_not_found", "Validation not found") from exc
    return ValidationStatusResponse.from_result(result)


def _safe_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )
