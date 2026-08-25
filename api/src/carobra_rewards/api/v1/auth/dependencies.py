from __future__ import annotations

from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends

from carobra_rewards.api.v1.sisca_validation.dependencies import (
    get_execute_validation_check,
    get_sisca_gateway,
)
from carobra_rewards.core.config import Settings, get_settings
from carobra_rewards.infrastructure.database.session import get_session_factory
from carobra_rewards.modules.customer_auth.application.service import CustomerAuthService
from carobra_rewards.modules.sisca_validation.application.models import (
    ExecuteValidationCheckCommand,
    ValidationExecutionResult,
)


def get_customer_auth_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> CustomerAuthService:
    async def execute_initial_validation(validation_id: UUID) -> ValidationExecutionResult:
        gateway = get_sisca_gateway(settings)
        execute_check = get_execute_validation_check(settings, gateway)
        return await execute_check(
            ExecuteValidationCheckCommand(
                validation_id=validation_id,
                checkpoint=None,
                manual=True,
            )
        )

    return CustomerAuthService(
        get_session_factory(),
        session_ttl=timedelta(hours=settings.auth_session_ttl_hours),
        initial_validation_check=execute_initial_validation,
    )
