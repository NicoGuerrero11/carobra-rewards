from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest

from carobra_rewards.modules.customer_intake.domain.entities import CustomerStatus
from carobra_rewards.modules.sisca_validation.application.models import (
    ExecuteValidationCheckCommand,
    RegisteredCustomerNotFoundError,
)
from carobra_rewards.modules.sisca_validation.application.scheduler import RunDueSiscaValidations
from carobra_rewards.modules.sisca_validation.application.service import (
    ExecuteSiscaValidationCheck,
)
from carobra_rewards.modules.sisca_validation.domain.models import (
    FoundSiscaValidation,
    SiscaGatewayResult,
    SiscaNoInformation,
    SiscaTechnicalFailure,
    SiscaValidation,
    SiscaValidationCheck,
    TechnicalFailureCategory,
    ValidationCheckOutcome,
    ValidationCheckpoint,
    ValidationStatus,
)
from carobra_rewards.modules.sisca_validation.domain.rules import normalize_gateway_result

NOW = datetime(2026, 7, 9, 18, 0, tzinfo=UTC)
KNOWN = frozenset({"Traspaso NAP", "Registro NAP", "Cambio AFORE"})
ALLOWED = frozenset({"Traspaso NAP", "Registro NAP"})


class SequenceGateway:
    def __init__(self, results: list[SiscaGatewayResult]) -> None:
        self.results = results
        self.calls = 0

    async def query(self, request):
        result = self.results[min(self.calls, len(self.results) - 1)]
        self.calls += 1
        return result


class FakeRepository:
    def __init__(self) -> None:
        self.validations: dict[UUID, SiscaValidation] = {}
        self.curps: dict[UUID, str] = {}
        self.checks: list[SiscaValidationCheck] = []
        self.customer_statuses: dict[UUID, CustomerStatus] = {}
        self.afore_activated: set[UUID] = set()

    async def get_by_id(self, validation_id, *, for_update=False):
        return self.validations.get(validation_id)

    async def get_by_customer_id(self, customer_id):
        return next(
            (item for item in self.validations.values() if item.customer_id == customer_id),
            None,
        )

    async def get_customer_curp(self, customer_id):
        return self.curps.get(customer_id)

    async def find_completed_scheduled_check(
        self,
        validation_id,
        checkpoint,
        *,
        check_type,
    ):
        matches = [
            item
            for item in self.checks
            if item.validation_id == validation_id
            and item.checkpoint is checkpoint
            and item.check_type is check_type
        ]
        return matches[-1] if matches else None

    async def next_attempt_number(self, validation_id, checkpoint):
        return (
            sum(
                item.validation_id == validation_id and item.checkpoint is checkpoint
                for item in self.checks
            )
            + 1
        )

    async def add_check(self, check):
        self.checks.append(check)

    async def update_validation(self, validation):
        self.validations[validation.id] = validation

    async def update_customer_status(self, customer_id, status):
        self.customer_statuses[customer_id] = status

    async def activate_afore_relation(self, customer_id, started_at):
        self.afore_activated.add(customer_id)

    async def list_due(self, now, *, limit):
        return tuple(
            item
            for item in self.validations.values()
            if item.next_checkpoint_at is not None and item.next_checkpoint_at <= now
        )[:limit]


class FakeUnitOfWork:
    def __init__(self, repository: FakeRepository) -> None:
        self._repository = repository
        self.commits = 0
        self.rollbacks = 0

    @property
    def validations(self):
        return self._repository

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if exc_type is None:
            await self.commit()
        else:
            await self.rollback()

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


def _pending_validation(*, checkpoint: ValidationCheckpoint) -> SiscaValidation:
    hours = {
        ValidationCheckpoint.H24: 24,
        ValidationCheckpoint.D3: 72,
        ValidationCheckpoint.D5: 120,
    }[checkpoint]
    validation = SiscaValidation.create(
        customer_id=UUID("00000000-0000-0000-0000-000000000101"),
        registered_at=NOW - timedelta(hours=hours),
    )
    if checkpoint is ValidationCheckpoint.H24:
        return validation
    return validation.__class__(
        **{
            **{field: getattr(validation, field) for field in validation.__dataclass_fields__},
            "next_checkpoint": checkpoint,
            "next_checkpoint_at": validation.due_at(checkpoint),
        }
    )


def _service(repo: FakeRepository, gateway: SequenceGateway, *, retries: int = 0):
    return ExecuteSiscaValidationCheck(
        unit_of_work=FakeUnitOfWork(repo),
        gateway=gateway,
        known_movement_types=KNOWN,
        allowed_movement_types=ALLOWED,
        minimum_transfer_date=date(2026, 7, 1),
        max_retries=retries,
        clock=lambda: NOW,
    )


def test_schedule_uses_exact_elapsed_hours() -> None:
    validation = SiscaValidation.create(customer_id=UUID(int=1), registered_at=NOW)

    assert validation.h24_due_at == NOW + timedelta(hours=24)
    assert validation.d3_due_at == NOW + timedelta(hours=72)
    assert validation.d5_due_at == NOW + timedelta(hours=120)


def test_unknown_catalog_is_a_technical_failure() -> None:
    result = normalize_gateway_result(
        FoundSiscaValidation("Movimiento desconocido", "ACEPTADA PROCESAR", date(2026, 7, 2)),
        known_movement_types=KNOWN,
        allowed_movement_types=ALLOWED,
        minimum_transfer_date=date(2026, 7, 1),
    )

    assert result.outcome is ValidationCheckOutcome.TECHNICAL_FAILURE
    assert result.error_category is TechnicalFailureCategory.UNKNOWN_CATALOG


def test_known_but_disallowed_movement_is_not_eligible() -> None:
    result = normalize_gateway_result(
        FoundSiscaValidation("Cambio AFORE", "ACEPTADA PROCESAR", date(2026, 7, 2)),
        known_movement_types=KNOWN,
        allowed_movement_types=ALLOWED,
        minimum_transfer_date=date(2026, 7, 1),
    )

    assert result.outcome is ValidationCheckOutcome.MATCH_NOT_ELIGIBLE


@pytest.mark.asyncio
async def test_validation_rejects_an_orphan_customer_without_calling_sisca() -> None:
    repo = FakeRepository()
    validation = _pending_validation(checkpoint=ValidationCheckpoint.H24)
    repo.validations[validation.id] = validation
    gateway = SequenceGateway([SiscaNoInformation()])

    with pytest.raises(RegisteredCustomerNotFoundError):
        await _service(repo, gateway)(
            ExecuteValidationCheckCommand(validation.id, ValidationCheckpoint.H24)
        )

    assert gateway.calls == 0


@pytest.mark.asyncio
async def test_h24_no_information_advances_to_d3() -> None:
    repo = FakeRepository()
    validation = _pending_validation(checkpoint=ValidationCheckpoint.H24)
    repo.validations[validation.id] = validation
    repo.curps[validation.customer_id] = "ABCD123456HMNLRS09"

    result = await _service(repo, SequenceGateway([SiscaNoInformation()]))(
        ExecuteValidationCheckCommand(validation.id, ValidationCheckpoint.H24)
    )

    assert result.status is ValidationStatus.PENDING
    assert result.next_checkpoint is ValidationCheckpoint.D3
    assert result.outcome is ValidationCheckOutcome.NO_INFORMATION


@pytest.mark.asyncio
async def test_controlled_uat_checkpoints_advance_without_waiting_for_calendar_time(caplog) -> None:
    repo = FakeRepository()
    validation = SiscaValidation.create(
        customer_id=UUID("00000000-0000-0000-0000-000000000101"),
        registered_at=NOW,
    )
    repo.validations[validation.id] = validation
    repo.curps[validation.customer_id] = "ABCD123456HMNLRS09"
    service = _service(
        repo,
        SequenceGateway([SiscaNoInformation(), SiscaNoInformation(), SiscaNoInformation()]),
    )
    caplog.set_level("INFO")

    h24 = await service(
        ExecuteValidationCheckCommand(
            validation.id,
            ValidationCheckpoint.H24,
            controlled_uat=True,
            operator_id="uat-operator-1",
        )
    )
    d3 = await service(
        ExecuteValidationCheckCommand(
            validation.id,
            ValidationCheckpoint.D3,
            controlled_uat=True,
            operator_id="uat-operator-1",
        )
    )
    d5 = await service(
        ExecuteValidationCheckCommand(
            validation.id,
            ValidationCheckpoint.D5,
            controlled_uat=True,
            operator_id="uat-operator-1",
        )
    )

    assert h24.next_checkpoint is ValidationCheckpoint.D3
    assert d3.next_checkpoint is ValidationCheckpoint.D5
    assert d5.status is ValidationStatus.CANCELLED
    assert [check.check_type.value for check in repo.checks] == ["CONTROLLED_UAT"] * 3
    assert {check.operator_id for check in repo.checks} == {"uat-operator-1"}
    audit = [
        record
        for record in caplog.records
        if getattr(record, "event", None) == "sisca_uat_controlled_checkpoint_completed"
    ]
    assert len(audit) == 3
    assert "ABCD123456HMNLRS09" not in repr(audit)


@pytest.mark.asyncio
async def test_controlled_uat_checkpoint_preserves_terminal_state_protection() -> None:
    repo = FakeRepository()
    validation = _pending_validation(checkpoint=ValidationCheckpoint.H24)
    terminal = validation.apply_result(
        checkpoint=ValidationCheckpoint.H24,
        result=normalize_gateway_result(
            FoundSiscaValidation("Traspaso NAP", "ACEPTADA PROCESAR", date(2026, 7, 2)),
            known_movement_types=KNOWN,
            allowed_movement_types=ALLOWED,
            minimum_transfer_date=date(2026, 7, 1),
        ),
        checked_at=NOW,
        manual=False,
    )
    repo.validations[terminal.id] = terminal
    gateway = SequenceGateway([SiscaNoInformation()])

    result = await _service(repo, gateway)(
        ExecuteValidationCheckCommand(
            terminal.id,
            ValidationCheckpoint.D3,
            controlled_uat=True,
            operator_id="uat-operator-1",
        )
    )

    assert result.stale is True
    assert gateway.calls == 0


@pytest.mark.asyncio
async def test_validated_match_activates_customer_and_afore() -> None:
    repo = FakeRepository()
    validation = _pending_validation(checkpoint=ValidationCheckpoint.H24)
    repo.validations[validation.id] = validation
    repo.curps[validation.customer_id] = "ABCD123456HMNLRS09"
    gateway = SequenceGateway(
        [FoundSiscaValidation("Traspaso NAP", "ACEPTADA PROCESAR", date(2026, 7, 2))]
    )

    result = await _service(repo, gateway)(
        ExecuteValidationCheckCommand(validation.id, ValidationCheckpoint.H24)
    )

    assert result.status is ValidationStatus.VALIDATED
    assert repo.customer_statuses[validation.customer_id] is CustomerStatus.ACTIVE
    assert validation.customer_id in repo.afore_activated


@pytest.mark.asyncio
async def test_d5_technical_failure_retries_then_requires_attention() -> None:
    repo = FakeRepository()
    validation = _pending_validation(checkpoint=ValidationCheckpoint.D5)
    repo.validations[validation.id] = validation
    repo.curps[validation.customer_id] = "ABCD123456HMNLRS09"
    failure = SiscaTechnicalFailure(TechnicalFailureCategory.TIMEOUT, retryable=True)
    gateway = SequenceGateway([failure, failure, failure])

    result = await _service(repo, gateway, retries=2)(
        ExecuteValidationCheckCommand(validation.id, ValidationCheckpoint.D5)
    )

    assert result.status is ValidationStatus.REQUIRES_ATTENTION
    assert result.attempts == 3
    assert gateway.calls == 3
    assert repo.validations[validation.id].team_notification_required is True


@pytest.mark.asyncio
async def test_scheduled_replay_does_not_call_gateway_twice() -> None:
    repo = FakeRepository()
    validation = _pending_validation(checkpoint=ValidationCheckpoint.H24)
    repo.validations[validation.id] = validation
    repo.curps[validation.customer_id] = "ABCD123456HMNLRS09"
    gateway = SequenceGateway([SiscaNoInformation()])
    service = _service(repo, gateway)
    command = ExecuteValidationCheckCommand(validation.id, ValidationCheckpoint.H24)

    await service(command)
    replay = await service(command)

    assert replay.replayed is True
    assert gateway.calls == 1


@pytest.mark.asyncio
async def test_manual_check_does_not_block_later_scheduled_checkpoint() -> None:
    repo = FakeRepository()
    validation = _pending_validation(checkpoint=ValidationCheckpoint.H24)
    repo.validations[validation.id] = validation
    repo.curps[validation.customer_id] = "ABCD123456HMNLRS09"
    gateway = SequenceGateway(
        [
            FoundSiscaValidation("Traspaso NAP", "ACEPTADA OPERACIONES", date(2026, 7, 2)),
            SiscaNoInformation(),
        ]
    )
    service = _service(repo, gateway)

    manual = await service(
        ExecuteValidationCheckCommand(
            validation.id,
            checkpoint=None,
            manual=True,
        )
    )
    scheduled = await service(
        ExecuteValidationCheckCommand(validation.id, ValidationCheckpoint.H24)
    )

    assert manual.replayed is False
    assert scheduled.replayed is False
    assert gateway.calls == 2


@pytest.mark.asyncio
async def test_terminal_scheduled_work_is_stale_without_gateway_call() -> None:
    repo = FakeRepository()
    validation = _pending_validation(checkpoint=ValidationCheckpoint.H24)
    validated = validation.apply_result(
        checkpoint=ValidationCheckpoint.H24,
        result=normalize_gateway_result(
            FoundSiscaValidation("Traspaso NAP", "ACEPTADA PROCESAR", date(2026, 7, 2)),
            known_movement_types=KNOWN,
            allowed_movement_types=ALLOWED,
            minimum_transfer_date=date(2026, 7, 1),
        ),
        checked_at=NOW,
        manual=False,
    )
    repo.validations[validated.id] = validated
    gateway = SequenceGateway([SiscaNoInformation()])

    result = await _service(repo, gateway)(
        ExecuteValidationCheckCommand(validated.id, ValidationCheckpoint.D3)
    )

    assert result.stale is True
    assert gateway.calls == 0


@pytest.mark.asyncio
async def test_due_runner_reuses_shared_execution_operation() -> None:
    repo = FakeRepository()
    validation = _pending_validation(checkpoint=ValidationCheckpoint.H24)
    repo.validations[validation.id] = validation
    repo.curps[validation.customer_id] = "ABCD123456HMNLRS09"
    execute = _service(repo, SequenceGateway([SiscaNoInformation()]))
    runner = RunDueSiscaValidations(
        unit_of_work=FakeUnitOfWork(repo),
        execute_check=execute,
        clock=lambda: NOW,
    )

    results = await runner()

    assert len(results) == 1
    assert results[0].next_checkpoint is ValidationCheckpoint.D3
