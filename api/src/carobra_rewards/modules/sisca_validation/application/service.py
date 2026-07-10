from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

from carobra_rewards.modules.customer_intake.domain.entities import CustomerStatus
from carobra_rewards.modules.customer_intake.domain.value_objects import normalize_curp
from carobra_rewards.modules.sisca_validation.application.models import (
    ExecuteValidationCheckCommand,
    RegisteredCustomerNotFoundError,
    ValidationCheckpointMismatchError,
    ValidationCheckpointNotDueError,
    ValidationExecutionResult,
    ValidationNotFoundError,
    ValidationStatusResult,
)
from carobra_rewards.modules.sisca_validation.domain.models import (
    SiscaValidation,
    SiscaValidationCheck,
    SiscaValidationRequest,
    ValidationCheckOutcome,
    ValidationCheckType,
    ValidationStatus,
    require_utc,
)
from carobra_rewards.modules.sisca_validation.domain.rules import (
    normalize_catalog_value,
    normalize_gateway_result,
)
from carobra_rewards.modules.sisca_validation.ports.gateway import SiscaValidationGateway
from carobra_rewards.modules.sisca_validation.ports.persistence import SiscaValidationUnitOfWork


def utc_now() -> datetime:
    return datetime.now(UTC)


class ExecuteSiscaValidationCheck:
    def __init__(
        self,
        *,
        unit_of_work: SiscaValidationUnitOfWork,
        gateway: SiscaValidationGateway,
        known_movement_types: frozenset[str],
        allowed_movement_types: frozenset[str],
        minimum_transfer_date: date | None,
        max_retries: int,
        clock=utc_now,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._gateway = gateway
        self._known_movement_types = frozenset(
            normalize_catalog_value(value) for value in known_movement_types
        )
        self._allowed_movement_types = frozenset(
            normalize_catalog_value(value) for value in allowed_movement_types
        )
        self._minimum_transfer_date = minimum_transfer_date
        self._max_retries = max(0, max_retries)
        self._clock = clock

    async def __call__(
        self,
        command: ExecuteValidationCheckCommand,
    ) -> ValidationExecutionResult:
        async with self._unit_of_work as uow:
            validation = await uow.validations.get_by_id(command.validation_id, for_update=True)
            if validation is None:
                raise ValidationNotFoundError()

            if not command.manual and command.checkpoint is None:
                raise ValueError("scheduled checks require a checkpoint")

            now = require_utc(self._clock())
            if not command.manual and command.checkpoint is not None:
                existing = await uow.validations.find_completed_scheduled_check(
                    validation.id,
                    command.checkpoint,
                    check_type=ValidationCheckType.SCHEDULED,
                )
                if existing is not None:
                    return self._result(validation, replayed=True, stale=False, attempts=0)
                if validation.status.is_terminal:
                    return self._result(validation, replayed=False, stale=True, attempts=0)
                if command.checkpoint is not validation.next_checkpoint:
                    raise ValidationCheckpointMismatchError()
                if now < validation.due_at(command.checkpoint):
                    raise ValidationCheckpointNotDueError()

            curp = await uow.validations.get_customer_curp(validation.customer_id)
            if curp is None:
                raise RegisteredCustomerNotFoundError()

            first_attempt = await uow.validations.next_attempt_number(
                validation.id,
                command.checkpoint,
            )
            attempts = 0
            normalized = None
            for retry_offset in range(self._max_retries + 1):
                attempts += 1
                attempt_number = first_attempt + retry_offset
                request_id = uuid4()
                started_at = require_utc(self._clock())
                gateway_result = await self._gateway.query(
                    SiscaValidationRequest(
                        curp=normalize_curp(curp),
                        request_id=request_id,
                        requested_at=started_at,
                    )
                )
                completed_at = require_utc(self._clock())
                normalized = normalize_gateway_result(
                    gateway_result,
                    known_movement_types=self._known_movement_types,
                    allowed_movement_types=self._allowed_movement_types,
                    minimum_transfer_date=self._minimum_transfer_date,
                )
                await uow.validations.add_check(
                    SiscaValidationCheck(
                        id=uuid4(),
                        validation_id=validation.id,
                        check_type=(
                            ValidationCheckType.MANUAL
                            if command.manual and retry_offset == 0
                            else ValidationCheckType.RETRY
                            if retry_offset > 0
                            else ValidationCheckType.SCHEDULED
                        ),
                        checkpoint=command.checkpoint,
                        attempt_number=attempt_number,
                        request_id=request_id,
                        started_at=started_at,
                        completed_at=completed_at,
                        http_status=normalized.http_status,
                        outcome=normalized.outcome,
                        raw_movement_type=normalized.raw_movement_type,
                        raw_sf_status=normalized.raw_sf_status,
                        raw_transfer_date=normalized.raw_transfer_date,
                        error_category=normalized.error_category,
                        retryable=normalized.retryable,
                        created_at=completed_at,
                    )
                )
                if not (
                    normalized.outcome is ValidationCheckOutcome.TECHNICAL_FAILURE
                    and normalized.retryable
                    and retry_offset < self._max_retries
                ):
                    break

            assert normalized is not None
            updated = validation.apply_result(
                checkpoint=command.checkpoint,
                result=normalized,
                checked_at=require_utc(self._clock()),
                manual=command.manual,
            )
            await uow.validations.update_validation(updated)
            if validation.status is ValidationStatus.PENDING:
                if updated.status is ValidationStatus.VALIDATED:
                    await uow.validations.update_customer_status(
                        updated.customer_id,
                        CustomerStatus.ACTIVE,
                    )
                    await uow.validations.activate_afore_relation(
                        updated.customer_id,
                        updated.validated_at or now,
                    )
                elif updated.status is ValidationStatus.CANCELLED:
                    await uow.validations.update_customer_status(
                        updated.customer_id,
                        CustomerStatus.INACTIVE,
                    )
            await uow.commit()
            return self._result(updated, replayed=False, stale=False, attempts=attempts)

    @staticmethod
    def _result(
        validation: SiscaValidation,
        *,
        replayed: bool,
        stale: bool,
        attempts: int,
    ) -> ValidationExecutionResult:
        return ValidationExecutionResult(
            validation_id=validation.id,
            status=validation.status,
            outcome=validation.last_check_outcome,
            next_checkpoint=validation.next_checkpoint,
            next_checkpoint_at=validation.next_checkpoint_at,
            replayed=replayed,
            stale=stale,
            attempts=attempts,
        )


class GetSiscaValidationStatus:
    def __init__(self, unit_of_work: SiscaValidationUnitOfWork) -> None:
        self._unit_of_work = unit_of_work

    async def __call__(self, customer_id) -> ValidationStatusResult:
        async with self._unit_of_work as uow:
            validation = await uow.validations.get_by_customer_id(customer_id)
            if validation is None:
                raise ValidationNotFoundError()
            return ValidationStatusResult(
                validation_id=validation.id,
                customer_id=validation.customer_id,
                status=validation.status,
                registered_at=validation.registered_at,
                next_checkpoint=validation.next_checkpoint,
                next_checkpoint_at=validation.next_checkpoint_at,
                last_checked_at=validation.last_checked_at,
                last_check_outcome=validation.last_check_outcome,
            )
