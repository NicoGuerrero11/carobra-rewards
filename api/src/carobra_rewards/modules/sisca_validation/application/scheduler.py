from __future__ import annotations

import logging
from datetime import UTC, datetime

from carobra_rewards.modules.sisca_validation.application.models import (
    ExecuteValidationCheckCommand,
    ValidationExecutionResult,
)
from carobra_rewards.modules.sisca_validation.application.service import ExecuteSiscaValidationCheck
from carobra_rewards.modules.sisca_validation.ports.persistence import SiscaValidationUnitOfWork

logger = logging.getLogger(__name__)


class RunDueSiscaValidations:
    def __init__(
        self,
        *,
        unit_of_work: SiscaValidationUnitOfWork,
        execute_check: ExecuteSiscaValidationCheck,
        clock=lambda: datetime.now(UTC),
    ) -> None:
        self._unit_of_work = unit_of_work
        self._execute_check = execute_check
        self._clock = clock

    async def __call__(self, *, limit: int = 100) -> tuple[ValidationExecutionResult, ...]:
        now = self._clock()
        async with self._unit_of_work as uow:
            due = await uow.validations.list_due(now, limit=limit)

        results: list[ValidationExecutionResult] = []
        for validation in due:
            if validation.next_checkpoint is None or validation.next_checkpoint_at is None:
                continue
            lag_ms = max(0.0, (now - validation.next_checkpoint_at).total_seconds() * 1000)
            logger.info(
                "sisca_validation_checkpoint_due",
                extra={
                    "event": "sisca_validation_checkpoint_due",
                    "validation_id": str(validation.id),
                    "checkpoint": validation.next_checkpoint.value,
                    "lag_ms": round(lag_ms, 3),
                },
            )
            results.append(
                await self._execute_check(
                    ExecuteValidationCheckCommand(
                        validation_id=validation.id,
                        checkpoint=validation.next_checkpoint,
                    )
                )
            )
        return tuple(results)
