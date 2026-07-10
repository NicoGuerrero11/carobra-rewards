from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.modules.customer_intake.domain.entities import CustomerStatus
from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    CustomerModel,
    CustomerServiceModel,
    ServiceModel,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.timestamps import utc_now
from carobra_rewards.modules.sisca_validation.domain.models import (
    SiscaValidation,
    SiscaValidationCheck,
    TechnicalFailureCategory,
    ValidationCheckOutcome,
    ValidationCheckpoint,
    ValidationCheckType,
    ValidationStatus,
)
from carobra_rewards.modules.sisca_validation.infrastructure.persistence.models import (
    SiscaValidationCheckModel,
    SiscaValidationModel,
)


class SiscaValidationPersistenceError(Exception):
    pass


def _to_validation(model: SiscaValidationModel) -> SiscaValidation:
    return SiscaValidation(
        id=model.id,
        customer_id=model.customer_id,
        status=ValidationStatus(model.status),
        registered_at=model.registered_at,
        h24_due_at=model.h24_due_at,
        d3_due_at=model.d3_due_at,
        d5_due_at=model.d5_due_at,
        next_checkpoint=(
            None if model.next_checkpoint is None else ValidationCheckpoint(model.next_checkpoint)
        ),
        next_checkpoint_at=model.next_checkpoint_at,
        last_checked_at=model.last_checked_at,
        last_check_outcome=(
            None
            if model.last_check_outcome is None
            else ValidationCheckOutcome(model.last_check_outcome)
        ),
        last_response_movement_type=model.last_response_movement_type,
        last_response_sf_status=model.last_response_sf_status,
        last_response_transfer_date=model.last_response_transfer_date,
        validated_at=model.validated_at,
        cancelled_at=model.cancelled_at,
        requires_attention_at=model.requires_attention_at,
        team_notification_required=model.team_notification_required,
        team_notified_at=model.team_notified_at,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _to_check(model: SiscaValidationCheckModel) -> SiscaValidationCheck:
    from carobra_rewards.modules.sisca_validation.domain.models import ValidationCheckType

    return SiscaValidationCheck(
        id=model.id,
        validation_id=model.validation_id,
        check_type=ValidationCheckType(model.check_type),
        checkpoint=None if model.checkpoint is None else ValidationCheckpoint(model.checkpoint),
        attempt_number=model.attempt_number,
        request_id=model.request_id,
        started_at=model.started_at,
        completed_at=model.completed_at,
        http_status=model.http_status,
        outcome=ValidationCheckOutcome(model.outcome),
        raw_movement_type=model.raw_movement_type,
        raw_sf_status=model.raw_sf_status,
        raw_transfer_date=model.raw_transfer_date,
        error_category=(
            None if model.error_category is None else TechnicalFailureCategory(model.error_category)
        ),
        retryable=model.retryable,
        created_at=model.created_at,
    )


class SqlAlchemySiscaValidationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_registered_customer_and_validation(
        self,
        *,
        customer_id: UUID,
        rewards_id: str,
        curp: str,
        nss: str,
        name: str,
        email: str,
        phone: str | None,
        postal_code: str | None,
        validation: SiscaValidation,
    ) -> None:
        self._session.add(
            CustomerModel(
                id=customer_id,
                rewards_id=rewards_id,
                curp=curp,
                nss=nss,
                name=name,
                email=email,
                phone=phone,
                postal_code=postal_code,
                customer_status=CustomerStatus.PENDING_VALIDATION.value,
                onboarding_status="PENDING",
                created_at=validation.registered_at,
                updated_at=validation.registered_at,
            )
        )
        self._session.add(self._validation_model(validation))
        await self._flush()

    async def get_by_id(
        self,
        validation_id: UUID,
        *,
        for_update: bool = False,
    ) -> SiscaValidation | None:
        statement = select(SiscaValidationModel).where(SiscaValidationModel.id == validation_id)
        if for_update:
            statement = statement.with_for_update()
        try:
            model = (await self._session.execute(statement)).scalar_one_or_none()
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc
        return None if model is None else _to_validation(model)

    async def get_by_customer_id(self, customer_id: UUID) -> SiscaValidation | None:
        statement = select(SiscaValidationModel).where(
            SiscaValidationModel.customer_id == customer_id
        )
        try:
            model = (await self._session.execute(statement)).scalar_one_or_none()
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc
        return None if model is None else _to_validation(model)

    async def get_customer_curp(self, customer_id: UUID) -> str | None:
        statement = select(CustomerModel.curp).where(CustomerModel.id == customer_id)
        try:
            return (await self._session.execute(statement)).scalar_one_or_none()
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc

    async def find_completed_scheduled_check(
        self,
        validation_id: UUID,
        checkpoint: ValidationCheckpoint,
        *,
        check_type: ValidationCheckType,
    ) -> SiscaValidationCheck | None:
        statement = (
            select(SiscaValidationCheckModel)
            .where(
                SiscaValidationCheckModel.validation_id == validation_id,
                SiscaValidationCheckModel.checkpoint == checkpoint.value,
                SiscaValidationCheckModel.check_type == check_type.value,
            )
            .order_by(SiscaValidationCheckModel.attempt_number.desc())
            .limit(1)
        )
        try:
            model = (await self._session.execute(statement)).scalar_one_or_none()
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc
        return None if model is None else _to_check(model)

    async def next_attempt_number(
        self,
        validation_id: UUID,
        checkpoint: ValidationCheckpoint | None,
    ) -> int:
        statement = select(func.max(SiscaValidationCheckModel.attempt_number)).where(
            SiscaValidationCheckModel.validation_id == validation_id,
            SiscaValidationCheckModel.checkpoint
            == (None if checkpoint is None else checkpoint.value),
        )
        try:
            current = (await self._session.execute(statement)).scalar_one()
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc
        return 1 if current is None else int(current) + 1

    async def add_check(self, check: SiscaValidationCheck) -> None:
        self._session.add(
            SiscaValidationCheckModel(
                id=check.id,
                validation_id=check.validation_id,
                check_type=check.check_type.value,
                checkpoint=None if check.checkpoint is None else check.checkpoint.value,
                attempt_number=check.attempt_number,
                request_id=check.request_id,
                started_at=check.started_at,
                completed_at=check.completed_at,
                http_status=check.http_status,
                outcome=check.outcome.value,
                raw_movement_type=check.raw_movement_type,
                raw_sf_status=check.raw_sf_status,
                raw_transfer_date=check.raw_transfer_date,
                error_category=(
                    None if check.error_category is None else check.error_category.value
                ),
                retryable=check.retryable,
                created_at=check.created_at,
            )
        )
        await self._flush()

    async def update_validation(self, validation: SiscaValidation) -> None:
        try:
            model = await self._session.get(SiscaValidationModel, validation.id)
            if model is None:
                raise SiscaValidationPersistenceError()
            model.status = validation.status.value
            model.next_checkpoint = (
                None if validation.next_checkpoint is None else validation.next_checkpoint.value
            )
            model.next_checkpoint_at = validation.next_checkpoint_at
            model.last_checked_at = validation.last_checked_at
            model.last_check_outcome = (
                None
                if validation.last_check_outcome is None
                else validation.last_check_outcome.value
            )
            model.last_response_movement_type = validation.last_response_movement_type
            model.last_response_sf_status = validation.last_response_sf_status
            model.last_response_transfer_date = validation.last_response_transfer_date
            model.validated_at = validation.validated_at
            model.cancelled_at = validation.cancelled_at
            model.requires_attention_at = validation.requires_attention_at
            model.team_notification_required = validation.team_notification_required
            model.team_notified_at = validation.team_notified_at
            model.updated_at = validation.updated_at
            await self._flush()
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc

    async def update_customer_status(self, customer_id: UUID, status: CustomerStatus) -> None:
        try:
            customer = await self._session.get(CustomerModel, customer_id)
            if customer is None:
                raise SiscaValidationPersistenceError()
            customer.customer_status = status.value
            customer.updated_at = utc_now()
            await self._flush()
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc

    async def activate_afore_relation(self, customer_id: UUID, started_at: datetime) -> None:
        service_statement = select(ServiceModel).where(ServiceModel.code == "AFORE")
        try:
            service = (await self._session.execute(service_statement)).scalar_one_or_none()
            if service is None:
                from carobra_rewards.modules.sisca_validation.application.models import (
                    AforeServiceNotConfiguredError,
                )

                raise AforeServiceNotConfiguredError()
            relation_statement = select(CustomerServiceModel).where(
                CustomerServiceModel.customer_id == customer_id,
                CustomerServiceModel.service_id == service.id,
            )
            relation = (await self._session.execute(relation_statement)).scalar_one_or_none()
            if relation is None:
                self._session.add(
                    CustomerServiceModel(
                        id=uuid4(),
                        customer_id=customer_id,
                        service_id=service.id,
                        status="ACTIVE",
                        started_at=started_at,
                        ended_at=None,
                        created_at=started_at,
                        updated_at=started_at,
                    )
                )
            else:
                relation.status = "ACTIVE"
                relation.started_at = started_at
                relation.ended_at = None
                relation.updated_at = started_at
            await self._flush()
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc

    async def list_due(self, now: datetime, *, limit: int) -> tuple[SiscaValidation, ...]:
        statement = (
            select(SiscaValidationModel)
            .where(
                SiscaValidationModel.status == ValidationStatus.PENDING.value,
                SiscaValidationModel.next_checkpoint_at <= now,
            )
            .order_by(SiscaValidationModel.next_checkpoint_at)
            .limit(limit)
        )
        try:
            models = (await self._session.execute(statement)).scalars().all()
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc
        return tuple(_to_validation(model) for model in models)

    @staticmethod
    def _validation_model(validation: SiscaValidation) -> SiscaValidationModel:
        if validation.next_checkpoint is None:
            raise SiscaValidationPersistenceError()
        return SiscaValidationModel(
            id=validation.id,
            customer_id=validation.customer_id,
            status=validation.status.value,
            registered_at=validation.registered_at,
            h24_due_at=validation.h24_due_at,
            d3_due_at=validation.d3_due_at,
            d5_due_at=validation.d5_due_at,
            next_checkpoint=validation.next_checkpoint.value,
            next_checkpoint_at=validation.next_checkpoint_at,
            last_checked_at=validation.last_checked_at,
            last_check_outcome=None,
            last_response_movement_type=None,
            last_response_sf_status=None,
            last_response_transfer_date=None,
            validated_at=None,
            cancelled_at=None,
            requires_attention_at=None,
            team_notification_required=False,
            team_notified_at=None,
            created_at=validation.created_at,
            updated_at=validation.updated_at,
        )

    async def _flush(self) -> None:
        try:
            await self._session.flush()
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc


class SqlAlchemySiscaValidationUnitOfWork:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self._validations: SqlAlchemySiscaValidationRepository | None = None
        self._finished = False

    @property
    def validations(self) -> SqlAlchemySiscaValidationRepository:
        assert self._validations is not None
        return self._validations

    async def __aenter__(self) -> SqlAlchemySiscaValidationUnitOfWork:
        self._session = self._session_factory()
        self._validations = SqlAlchemySiscaValidationRepository(self._session)
        self._finished = False
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        assert self._session is not None
        try:
            if not self._finished:
                if exc_type is None:
                    await self.commit()
                else:
                    await self.rollback()
        finally:
            await self._session.close()
            self._session = None
            self._validations = None

    async def commit(self) -> None:
        assert self._session is not None
        try:
            await self._session.commit()
            self._finished = True
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc

    async def rollback(self) -> None:
        assert self._session is not None
        try:
            await self._session.rollback()
            self._finished = True
        except SQLAlchemyError as exc:
            raise SiscaValidationPersistenceError() from exc
