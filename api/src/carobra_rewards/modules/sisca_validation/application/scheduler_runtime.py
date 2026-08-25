from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from carobra_rewards.modules.sisca_validation.application.models import (
    ValidationExecutionResult,
)

logger = logging.getLogger(__name__)

RunDueValidations = Callable[..., Awaitable[tuple[ValidationExecutionResult, ...]]]


async def run_sisca_scheduler_loop(
    run_due: RunDueValidations,
    *,
    poll_seconds: float,
    batch_size: int,
) -> None:
    if poll_seconds <= 0:
        raise ValueError("poll_seconds must be positive")
    if batch_size < 1:
        raise ValueError("batch_size must be positive")

    while True:
        try:
            results = await run_due(limit=batch_size)
            if results:
                logger.info(
                    "sisca_scheduler_batch_completed",
                    extra={
                        "event": "sisca_scheduler_batch_completed",
                        "processed": len(results),
                    },
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "sisca_scheduler_iteration_failed",
                extra={"event": "sisca_scheduler_iteration_failed"},
            )
        await asyncio.sleep(poll_seconds)
