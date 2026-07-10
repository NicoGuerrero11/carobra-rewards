from __future__ import annotations

from datetime import datetime
from typing import Protocol, Self
from uuid import UUID

from carobra_rewards.modules.customer_intake.domain.entities import CustomerStatus
from carobra_rewards.modules.sisca_validation.domain.models import (
    SiscaValidation,
    SiscaValidationCheck,
    ValidationCheckpoint,
    ValidationCheckType,
)


class SiscaValidationRepository(Protocol):
    async def get_by_id(
        self,
        validation_id: UUID,
        *,
        for_update: bool = False,
    ) -> SiscaValidation | None: ...

    async def get_by_customer_id(self, customer_id: UUID) -> SiscaValidation | None: ...

    async def get_customer_curp(self, customer_id: UUID) -> str | None: ...

    async def find_completed_scheduled_check(
        self,
        validation_id: UUID,
        checkpoint: ValidationCheckpoint,
        *,
        check_type: ValidationCheckType,
    ) -> SiscaValidationCheck | None: ...

    async def next_attempt_number(
        self,
        validation_id: UUID,
        checkpoint: ValidationCheckpoint | None,
    ) -> int: ...

    async def add_check(self, check: SiscaValidationCheck) -> None: ...

    async def update_validation(self, validation: SiscaValidation) -> None: ...

    async def update_customer_status(self, customer_id: UUID, status: CustomerStatus) -> None: ...

    async def activate_afore_relation(self, customer_id: UUID, started_at: datetime) -> None: ...

    async def list_due(self, now: datetime, *, limit: int) -> tuple[SiscaValidation, ...]: ...


class SiscaValidationUnitOfWork(Protocol):
    @property
    def validations(self) -> SiscaValidationRepository: ...

    async def __aenter__(self) -> Self: ...

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None: ...

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...
