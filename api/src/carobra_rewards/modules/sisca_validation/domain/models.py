from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from uuid import UUID, uuid4


class ValidationStatus(StrEnum):
    PENDING = "PENDING"
    VALIDATED = "VALIDATED"
    CANCELLED = "CANCELLED"
    REQUIRES_ATTENTION = "REQUIRES_ATTENTION"

    @property
    def is_terminal(self) -> bool:
        return self is not ValidationStatus.PENDING


class ValidationCheckpoint(StrEnum):
    H24 = "H24"
    D3 = "D3"
    D5 = "D5"


class ValidationCheckType(StrEnum):
    SCHEDULED = "SCHEDULED"
    MANUAL = "MANUAL"
    RETRY = "RETRY"
    CONTROLLED_UAT = "CONTROLLED_UAT"


class ValidationCheckOutcome(StrEnum):
    MATCH_VALIDATED = "MATCH_VALIDATED"
    MATCH_TEMPORARY_PENDING = "MATCH_TEMPORARY_PENDING"
    MATCH_CANCELLED = "MATCH_CANCELLED"
    MATCH_NOT_ELIGIBLE = "MATCH_NOT_ELIGIBLE"
    NO_INFORMATION = "NO_INFORMATION"
    TECHNICAL_FAILURE = "TECHNICAL_FAILURE"


class TechnicalFailureCategory(StrEnum):
    CONNECTION = "CONNECTION"
    TIMEOUT = "TIMEOUT"
    AUTHENTICATION = "AUTHENTICATION"
    RATE_LIMIT = "RATE_LIMIT"
    SERVER = "SERVER"
    MALFORMED_RESPONSE = "MALFORMED_RESPONSE"
    UNKNOWN_CATALOG = "UNKNOWN_CATALOG"


@dataclass(slots=True, frozen=True)
class SiscaValidationRequest:
    curp: str
    request_id: UUID
    requested_at: datetime


@dataclass(slots=True, frozen=True)
class FoundSiscaValidation:
    movement_type: str
    sf_status: str
    transfer_date: date
    http_status: int = 200


@dataclass(slots=True, frozen=True)
class SiscaNoInformation:
    http_status: int = 200


@dataclass(slots=True, frozen=True)
class SiscaTechnicalFailure:
    category: TechnicalFailureCategory
    retryable: bool
    http_status: int | None = None


SiscaGatewayResult = FoundSiscaValidation | SiscaNoInformation | SiscaTechnicalFailure


@dataclass(slots=True, frozen=True)
class NormalizedCheckResult:
    outcome: ValidationCheckOutcome
    http_status: int | None
    raw_movement_type: str | None = None
    raw_sf_status: str | None = None
    raw_transfer_date: date | None = None
    error_category: TechnicalFailureCategory | None = None
    retryable: bool = False


@dataclass(slots=True, frozen=True)
class SiscaValidation:
    id: UUID
    customer_id: UUID
    status: ValidationStatus
    registered_at: datetime
    h24_due_at: datetime
    d3_due_at: datetime
    d5_due_at: datetime
    next_checkpoint: ValidationCheckpoint | None
    next_checkpoint_at: datetime | None
    last_checked_at: datetime | None
    last_check_outcome: ValidationCheckOutcome | None
    last_response_movement_type: str | None
    last_response_sf_status: str | None
    last_response_transfer_date: date | None
    validated_at: datetime | None
    cancelled_at: datetime | None
    requires_attention_at: datetime | None
    team_notification_required: bool
    team_notified_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def create(
        cls,
        *,
        customer_id: UUID,
        registered_at: datetime,
        id: UUID | None = None,
    ) -> SiscaValidation:
        registered_at = require_utc(registered_at)
        return cls(
            id=id or uuid4(),
            customer_id=customer_id,
            status=ValidationStatus.PENDING,
            registered_at=registered_at,
            h24_due_at=registered_at + timedelta(hours=24),
            d3_due_at=registered_at + timedelta(hours=72),
            d5_due_at=registered_at + timedelta(hours=120),
            next_checkpoint=ValidationCheckpoint.H24,
            next_checkpoint_at=registered_at + timedelta(hours=24),
            last_checked_at=None,
            last_check_outcome=None,
            last_response_movement_type=None,
            last_response_sf_status=None,
            last_response_transfer_date=None,
            validated_at=None,
            cancelled_at=None,
            requires_attention_at=None,
            team_notification_required=False,
            team_notified_at=None,
            created_at=registered_at,
            updated_at=registered_at,
        )

    def due_at(self, checkpoint: ValidationCheckpoint) -> datetime:
        return {
            ValidationCheckpoint.H24: self.h24_due_at,
            ValidationCheckpoint.D3: self.d3_due_at,
            ValidationCheckpoint.D5: self.d5_due_at,
        }[checkpoint]

    def apply_result(
        self,
        *,
        checkpoint: ValidationCheckpoint | None,
        result: NormalizedCheckResult,
        checked_at: datetime,
        manual: bool,
    ) -> SiscaValidation:
        checked_at = require_utc(checked_at)
        status = self.status
        next_checkpoint = self.next_checkpoint
        next_checkpoint_at = self.next_checkpoint_at
        validated_at = self.validated_at
        cancelled_at = self.cancelled_at
        requires_attention_at = self.requires_attention_at
        team_notification_required = self.team_notification_required

        if not self.status.is_terminal:
            if result.outcome is ValidationCheckOutcome.MATCH_VALIDATED:
                status = ValidationStatus.VALIDATED
                validated_at = checked_at
                next_checkpoint = None
                next_checkpoint_at = None
            elif result.outcome in {
                ValidationCheckOutcome.MATCH_CANCELLED,
                ValidationCheckOutcome.MATCH_NOT_ELIGIBLE,
            }:
                status = ValidationStatus.CANCELLED
                cancelled_at = checked_at
                team_notification_required = True
                next_checkpoint = None
                next_checkpoint_at = None
            elif checkpoint is ValidationCheckpoint.D5:
                if result.outcome is ValidationCheckOutcome.NO_INFORMATION:
                    status = ValidationStatus.CANCELLED
                    cancelled_at = checked_at
                else:
                    status = ValidationStatus.REQUIRES_ATTENTION
                    requires_attention_at = checked_at
                team_notification_required = True
                next_checkpoint = None
                next_checkpoint_at = None
            elif not manual and checkpoint is ValidationCheckpoint.H24:
                next_checkpoint = ValidationCheckpoint.D3
                next_checkpoint_at = self.d3_due_at
            elif not manual and checkpoint is ValidationCheckpoint.D3:
                next_checkpoint = ValidationCheckpoint.D5
                next_checkpoint_at = self.d5_due_at

        return replace(
            self,
            status=status,
            next_checkpoint=next_checkpoint,
            next_checkpoint_at=next_checkpoint_at,
            last_checked_at=checked_at,
            last_check_outcome=result.outcome,
            last_response_movement_type=result.raw_movement_type,
            last_response_sf_status=result.raw_sf_status,
            last_response_transfer_date=result.raw_transfer_date,
            validated_at=validated_at,
            cancelled_at=cancelled_at,
            requires_attention_at=requires_attention_at,
            team_notification_required=team_notification_required,
            updated_at=checked_at,
        )


@dataclass(slots=True, frozen=True)
class SiscaValidationCheck:
    id: UUID
    validation_id: UUID
    check_type: ValidationCheckType
    checkpoint: ValidationCheckpoint | None
    attempt_number: int
    request_id: UUID
    started_at: datetime
    completed_at: datetime
    http_status: int | None
    outcome: ValidationCheckOutcome
    raw_movement_type: str | None
    raw_sf_status: str | None
    raw_transfer_date: date | None
    error_category: TechnicalFailureCategory | None
    retryable: bool
    created_at: datetime
    operator_id: str | None = None


def require_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timezone-aware datetime required")
    return value.astimezone(UTC)
