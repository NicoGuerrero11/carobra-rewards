from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from carobra_rewards.modules.sisca_validation.application.models import (
    ValidationExecutionResult,
    ValidationStatusResult,
)
from carobra_rewards.modules.sisca_validation.domain.models import ValidationCheckpoint


class ExecuteValidationCheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["scheduled", "manual"] = "scheduled"
    checkpoint: ValidationCheckpoint | None = None

    @model_validator(mode="after")
    def validate_mode(self) -> ExecuteValidationCheckRequest:
        if self.mode == "scheduled" and self.checkpoint is None:
            raise ValueError("scheduled checks require checkpoint")
        if self.mode == "manual" and self.checkpoint is not None:
            raise ValueError("manual checks must not apply scheduled checkpoint semantics")
        return self


class ExecuteControlledUatCheckpointRequest(BaseModel):
    """A UAT-only checkpoint that retains normal lifecycle semantics."""

    model_config = ConfigDict(extra="forbid")

    checkpoint: ValidationCheckpoint


class ValidationExecutionResponse(BaseModel):
    validation_id: UUID
    status: str
    outcome: str | None
    next_checkpoint: str | None
    next_checkpoint_at: datetime | None
    replayed: bool
    stale: bool
    attempts: int

    @classmethod
    def from_result(cls, result: ValidationExecutionResult) -> ValidationExecutionResponse:
        return cls(
            validation_id=result.validation_id,
            status=result.status.value,
            outcome=None if result.outcome is None else result.outcome.value,
            next_checkpoint=(
                None if result.next_checkpoint is None else result.next_checkpoint.value
            ),
            next_checkpoint_at=result.next_checkpoint_at,
            replayed=result.replayed,
            stale=result.stale,
            attempts=result.attempts,
        )


class ValidationStatusResponse(BaseModel):
    validation_id: UUID
    customer_id: UUID
    status: str
    registered_at: datetime
    next_checkpoint: str | None
    next_checkpoint_at: datetime | None
    last_checked_at: datetime | None
    last_check_outcome: str | None

    @classmethod
    def from_result(cls, result: ValidationStatusResult) -> ValidationStatusResponse:
        return cls(
            validation_id=result.validation_id,
            customer_id=result.customer_id,
            status=result.status.value,
            registered_at=result.registered_at,
            next_checkpoint=(
                None if result.next_checkpoint is None else result.next_checkpoint.value
            ),
            next_checkpoint_at=result.next_checkpoint_at,
            last_checked_at=result.last_checked_at,
            last_check_outcome=(
                None if result.last_check_outcome is None else result.last_check_outcome.value
            ),
        )


class ValidationErrorDetail(BaseModel):
    code: str
    message: str


class ValidationErrorEnvelope(BaseModel):
    detail: ValidationErrorDetail
