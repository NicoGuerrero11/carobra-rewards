from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from carobra_rewards.modules.sisca_validation.domain.models import (
    ValidationCheckOutcome,
    ValidationCheckpoint,
    ValidationStatus,
)


@dataclass(slots=True, frozen=True)
class ExecuteValidationCheckCommand:
    validation_id: UUID
    checkpoint: ValidationCheckpoint | None
    manual: bool = False


@dataclass(slots=True, frozen=True)
class ValidationExecutionResult:
    validation_id: UUID
    status: ValidationStatus
    outcome: ValidationCheckOutcome | None
    next_checkpoint: ValidationCheckpoint | None
    next_checkpoint_at: datetime | None
    replayed: bool
    stale: bool
    attempts: int


@dataclass(slots=True, frozen=True)
class ValidationStatusResult:
    validation_id: UUID
    customer_id: UUID
    status: ValidationStatus
    registered_at: datetime
    next_checkpoint: ValidationCheckpoint | None
    next_checkpoint_at: datetime | None
    last_checked_at: datetime | None
    last_check_outcome: ValidationCheckOutcome | None


class ValidationNotFoundError(Exception):
    pass


class ValidationCheckpointNotDueError(Exception):
    pass


class ValidationCheckpointMismatchError(Exception):
    pass


class RegisteredCustomerNotFoundError(Exception):
    pass


class AforeServiceNotConfiguredError(Exception):
    pass
