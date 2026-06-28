"""Persistence adapters for customer intake."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import replace
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.modules.customer_intake.domain.entities import (
    Customer,
    CustomerIntakeRequest,
    CustomerService,
    CustomerServiceStatus,
    CustomerStatus,
    IntakeProcessingStatus,
    OnboardingStatus,
    Service,
)
from carobra_rewards.modules.customer_intake.domain.errors import (
    DuplicateCustomerCurpError,
    DuplicateCustomerRewardsIdError,
    DuplicateCustomerServiceError,
    DuplicateExternalRequestError,
    IntakeCustomerReassignmentError,
    IntakeRequestNotFoundError,
    UnexpectedPersistenceError,
)
from carobra_rewards.modules.customer_intake.domain.value_objects import JsonObject, normalize_curp
from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    CustomerIntakeRequestModel,
    CustomerModel,
    CustomerServiceModel,
    ServiceModel,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.timestamps import (
    utc_now,
)

_UNSET = object()
_SUCCESS_STATUSES = {
    IntakeProcessingStatus.APPROVED,
    IntakeProcessingStatus.ALREADY_ACTIVE,
}


def _clone_json(payload: JsonObject | None) -> JsonObject | None:
    if payload is None:
        return None
    return cast(JsonObject, deepcopy(payload))


def _to_intake_entity(model: CustomerIntakeRequestModel) -> CustomerIntakeRequest:
    return CustomerIntakeRequest(
        id=model.id,
        source=model.source,
        external_request_id=model.external_request_id,
        curp=model.curp,
        processing_status=IntakeProcessingStatus(model.processing_status),
        processing_details=_clone_json(cast(JsonObject | None, model.processing_details)),
        original_payload=cast(JsonObject, deepcopy(model.original_payload)),
        customer_id=model.customer_id,
        received_at=model.received_at,
        processed_at=model.processed_at,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _to_customer_entity(model: CustomerModel) -> Customer:
    return Customer(
        id=model.id,
        rewards_id=model.rewards_id,
        curp=model.curp,
        nss=model.nss,
        name=model.name,
        email=model.email,
        phone=model.phone,
        postal_code=model.postal_code,
        customer_status=CustomerStatus(model.customer_status),
        onboarding_status=OnboardingStatus(model.onboarding_status),
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _to_service_entity(model: ServiceModel) -> Service:
    return Service(
        id=model.id,
        code=model.code,
        name=model.name,
        is_active=model.is_active,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _to_customer_service_entity(model: CustomerServiceModel) -> CustomerService:
    return CustomerService(
        id=model.id,
        customer_id=model.customer_id,
        service_id=model.service_id,
        status=CustomerServiceStatus(model.status),
        started_at=model.started_at,
        ended_at=model.ended_at,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _restore_state(target: object, snapshot: object) -> None:
    target.__dict__.clear()
    target.__dict__.update(deepcopy(snapshot.__dict__))


def _constraint_name(error: IntegrityError) -> str | None:
    candidates = [
        getattr(error, "orig", None),
        getattr(getattr(error, "orig", None), "__cause__", None),
        getattr(getattr(error, "orig", None), "__context__", None),
    ]
    for candidate in candidates:
        if candidate is None:
            continue
        diag = getattr(candidate, "diag", None)
        constraint_name = cast(str | None, getattr(diag, "constraint_name", None))
        if constraint_name:
            return constraint_name
        direct_name = cast(str | None, getattr(candidate, "constraint_name", None))
        if direct_name:
            return direct_name
        message = str(candidate)
        for known_name in (
            "uq_intake_source_external",
            "uq_customers_curp",
            "uq_customers_rewards_id",
            "uq_customer_service_pair",
        ):
            if known_name in message:
                return known_name
    return None


def _map_integrity_error(error: IntegrityError) -> Exception:
    match _constraint_name(error):
        case "uq_intake_source_external":
            return DuplicateExternalRequestError()
        case "uq_customers_curp":
            return DuplicateCustomerCurpError()
        case "uq_customers_rewards_id":
            return DuplicateCustomerRewardsIdError()
        case "uq_customer_service_pair":
            return DuplicateCustomerServiceError()
        case _:
            return UnexpectedPersistenceError()


class InMemoryCustomerIntakeRequestRepository:
    """Simple in-memory adapter matching the persistence port."""

    def __init__(self) -> None:
        self._records: dict[UUID, CustomerIntakeRequest] = {}
        self._by_source_key: dict[tuple[str, str], UUID] = {}

    async def save(self, intake_request: CustomerIntakeRequest) -> None:
        key = (intake_request.source, intake_request.external_request_id)
        existing_id = self._by_source_key.get(key)
        if existing_id is not None and existing_id != intake_request.id:
            raise DuplicateExternalRequestError()
        self._records[intake_request.id] = intake_request
        self._by_source_key[key] = intake_request.id

    async def get_by_source_and_external_request_id(
        self,
        source: str,
        external_request_id: str,
    ) -> CustomerIntakeRequest | None:
        record_id = self._by_source_key.get((source, external_request_id))
        if record_id is None:
            return None
        return self._records[record_id]

    async def associate_customer(self, intake_request_id: UUID, customer_id: UUID) -> None:
        intake_request = self._records.get(intake_request_id)
        if intake_request is None:
            raise IntakeRequestNotFoundError()
        if intake_request.customer_id is not None and intake_request.customer_id != customer_id:
            raise IntakeCustomerReassignmentError()
        self._records[intake_request_id] = replace(
            intake_request,
            customer_id=customer_id,
            updated_at=utc_now(),
        )

    async def update_status(
        self,
        intake_request_id: UUID,
        processing_status: IntakeProcessingStatus,
        processing_details: JsonObject | None,
        *,
        processed_at: datetime | None | object = _UNSET,
    ) -> None:
        intake_request = self._records.get(intake_request_id)
        if intake_request is None:
            raise IntakeRequestNotFoundError()
        if (
            intake_request.processing_status == processing_status
            or processed_at is _UNSET
        ):
            next_processed_at = intake_request.processed_at
        else:
            next_processed_at = cast(datetime | None, processed_at)
        next_details = (
            None if processing_status in _SUCCESS_STATUSES else _clone_json(processing_details)
        )
        self._records[intake_request_id] = replace(
            intake_request,
            processing_status=processing_status,
            processing_details=next_details,
            processed_at=next_processed_at,
            updated_at=utc_now(),
        )

    def list_submissions(self) -> tuple[CustomerIntakeRequest, ...]:
        return tuple(self._records.values())


class InMemoryCustomerRepository:
    def __init__(self) -> None:
        self._by_id: dict[UUID, Customer] = {}
        self._by_rewards_id: dict[str, UUID] = {}
        self._by_curp: dict[str, UUID] = {}

    async def create(self, customer: Customer) -> None:
        normalized_curp = normalize_curp(customer.curp)
        if customer.rewards_id in self._by_rewards_id:
            raise DuplicateCustomerRewardsIdError()
        if normalized_curp in self._by_curp:
            raise DuplicateCustomerCurpError()
        stored = replace(customer, curp=normalized_curp)
        self._by_id[stored.id] = stored
        self._by_rewards_id[stored.rewards_id] = stored.id
        self._by_curp[stored.curp] = stored.id

    async def get_by_id(self, customer_id: UUID) -> Customer | None:
        return self._by_id.get(customer_id)

    async def get_by_rewards_id(self, rewards_id: str) -> Customer | None:
        customer_id = self._by_rewards_id.get(rewards_id)
        if customer_id is None:
            return None
        return self._by_id[customer_id]

    async def get_by_curp(self, curp: str) -> Customer | None:
        customer_id = self._by_curp.get(normalize_curp(curp))
        if customer_id is None:
            return None
        return self._by_id[customer_id]


class InMemoryServiceRepository:
    def __init__(self, services: list[Service] | None = None) -> None:
        self._by_code = {service.code: service for service in services or []}

    async def get_by_code(self, code: str) -> Service | None:
        return self._by_code.get(code)


class InMemoryCustomerServiceRepository:
    def __init__(self) -> None:
        self._by_id: dict[UUID, CustomerService] = {}
        self._by_pair: dict[tuple[UUID, UUID], UUID] = {}

    async def create(self, customer_service: CustomerService) -> None:
        key = (customer_service.customer_id, customer_service.service_id)
        if key in self._by_pair:
            raise DuplicateCustomerServiceError()
        self._by_id[customer_service.id] = customer_service
        self._by_pair[key] = customer_service.id

    async def get_by_customer_and_service(
        self,
        customer_id: UUID,
        service_id: UUID,
    ) -> CustomerService | None:
        relation_id = self._by_pair.get((customer_id, service_id))
        if relation_id is None:
            return None
        return self._by_id[relation_id]

    async def update_status_and_dates(
        self,
        customer_service_id: UUID,
        status: CustomerServiceStatus,
        *,
        started_at: datetime | None | object = _UNSET,
        ended_at: datetime | None | object = _UNSET,
    ) -> None:
        relation = self._by_id[customer_service_id]
        self._by_id[customer_service_id] = replace(
            relation,
            status=status,
            started_at=(
                relation.started_at
                if started_at is _UNSET
                else cast(datetime | None, started_at)
            ),
            ended_at=(
                relation.ended_at if ended_at is _UNSET else cast(datetime | None, ended_at)
            ),
            updated_at=utc_now(),
        )


class InMemoryCustomerIntakeUnitOfWork:
    """In-memory unit of work for application tests and DB-free execution."""

    def __init__(
        self,
        intake_requests: InMemoryCustomerIntakeRequestRepository | None = None,
        customers: InMemoryCustomerRepository | None = None,
        services: InMemoryServiceRepository | None = None,
        customer_services: InMemoryCustomerServiceRepository | None = None,
        repository: InMemoryCustomerIntakeRequestRepository | None = None,
    ) -> None:
        self._intake_requests = (
            intake_requests or repository or InMemoryCustomerIntakeRequestRepository()
        )
        self._customers = customers or InMemoryCustomerRepository()
        self._services = services or InMemoryServiceRepository()
        self._customer_services = customer_services or InMemoryCustomerServiceRepository()
        self.committed = False
        self.rolled_back = False
        self._snapshot: tuple[object, object, object, object] | None = None

    @property
    def intake_requests(self) -> InMemoryCustomerIntakeRequestRepository:
        return self._intake_requests

    @property
    def customers(self) -> InMemoryCustomerRepository:
        return self._customers

    @property
    def services(self) -> InMemoryServiceRepository:
        return self._services

    @property
    def customer_services(self) -> InMemoryCustomerServiceRepository:
        return self._customer_services

    def _take_snapshot(self) -> tuple[object, object, object, object]:
        return (
            deepcopy(self._intake_requests),
            deepcopy(self._customers),
            deepcopy(self._services),
            deepcopy(self._customer_services),
        )

    def _restore_snapshot(self, snapshot: tuple[object, object, object, object]) -> None:
        _restore_state(self._intake_requests, snapshot[0])
        _restore_state(self._customers, snapshot[1])
        _restore_state(self._services, snapshot[2])
        _restore_state(self._customer_services, snapshot[3])

    async def __aenter__(self) -> InMemoryCustomerIntakeUnitOfWork:
        self._snapshot = self._take_snapshot()
        self.committed = False
        self.rolled_back = False
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        if exc_type is None:
            await self.commit()
        else:
            await self.rollback()

    async def commit(self) -> None:
        self.committed = True
        self._snapshot = None

    async def rollback(self) -> None:
        if self._snapshot is not None:
            self._restore_snapshot(self._snapshot)
        self.rolled_back = True
        self._snapshot = None

    @asynccontextmanager
    async def savepoint(self) -> AsyncIterator[None]:
        snapshot = self._take_snapshot()
        try:
            yield
        except Exception:
            self._restore_snapshot(snapshot)
            raise


class SqlAlchemyCustomerIntakeRequestRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, intake_request: CustomerIntakeRequest) -> None:
        model = CustomerIntakeRequestModel(
            id=intake_request.id,
            source=intake_request.source,
            external_request_id=intake_request.external_request_id,
            curp=normalize_curp(intake_request.curp),
            processing_status=intake_request.processing_status.value,
            processing_details=_clone_json(intake_request.processing_details),
            original_payload=cast(JsonObject, deepcopy(intake_request.original_payload)),
            customer_id=intake_request.customer_id,
            received_at=intake_request.received_at,
            processed_at=intake_request.processed_at,
            created_at=intake_request.created_at,
            updated_at=intake_request.updated_at,
        )
        self._session.add(model)
        try:
            await self._session.flush()
        except IntegrityError as exc:
            raise _map_integrity_error(exc) from exc
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc

    async def get_by_source_and_external_request_id(
        self,
        source: str,
        external_request_id: str,
    ) -> CustomerIntakeRequest | None:
        statement = select(CustomerIntakeRequestModel).where(
            CustomerIntakeRequestModel.source == source,
            CustomerIntakeRequestModel.external_request_id == external_request_id,
        )
        try:
            model = (await self._session.execute(statement)).scalar_one_or_none()
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc
        if model is None:
            return None
        return _to_intake_entity(model)

    async def associate_customer(self, intake_request_id: UUID, customer_id: UUID) -> None:
        try:
            model = await self._session.get(CustomerIntakeRequestModel, intake_request_id)
            if model is None:
                raise IntakeRequestNotFoundError()
            if model.customer_id is not None and model.customer_id != customer_id:
                raise IntakeCustomerReassignmentError()
            model.customer_id = customer_id
            model.updated_at = utc_now()
            await self._session.flush()
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc

    async def update_status(
        self,
        intake_request_id: UUID,
        processing_status: IntakeProcessingStatus,
        processing_details: JsonObject | None,
        *,
        processed_at: datetime | None | object = _UNSET,
    ) -> None:
        try:
            model = await self._session.get(CustomerIntakeRequestModel, intake_request_id)
            if model is None:
                raise IntakeRequestNotFoundError()
            if model.processing_status == processing_status.value:
                processed_at = model.processed_at
            elif (
                processed_at is _UNSET
                and processing_status in _SUCCESS_STATUSES
                and model.processed_at is None
            ):
                processed_at = datetime.now(UTC)
            model.processing_status = processing_status.value
            model.processing_details = (
                None if processing_status in _SUCCESS_STATUSES else _clone_json(processing_details)
            )
            if processed_at is not _UNSET:
                model.processed_at = cast(datetime | None, processed_at)
            model.updated_at = utc_now()
            await self._session.flush()
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc


class SqlAlchemyCustomerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, customer: Customer) -> None:
        model = CustomerModel(
            id=customer.id,
            rewards_id=customer.rewards_id,
            curp=normalize_curp(customer.curp),
            nss=customer.nss,
            name=customer.name,
            email=customer.email,
            phone=customer.phone,
            postal_code=customer.postal_code,
            customer_status=customer.customer_status.value,
            onboarding_status=customer.onboarding_status.value,
            created_at=customer.created_at,
            updated_at=customer.updated_at,
        )
        self._session.add(model)
        try:
            await self._session.flush()
        except IntegrityError as exc:
            raise _map_integrity_error(exc) from exc
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc

    async def get_by_id(self, customer_id: UUID) -> Customer | None:
        try:
            model = await self._session.get(CustomerModel, customer_id)
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc
        if model is None:
            return None
        return _to_customer_entity(model)

    async def get_by_rewards_id(self, rewards_id: str) -> Customer | None:
        statement = select(CustomerModel).where(CustomerModel.rewards_id == rewards_id)
        try:
            model = (await self._session.execute(statement)).scalar_one_or_none()
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc
        if model is None:
            return None
        return _to_customer_entity(model)

    async def get_by_curp(self, curp: str) -> Customer | None:
        statement = select(CustomerModel).where(CustomerModel.curp == normalize_curp(curp))
        try:
            model = (await self._session.execute(statement)).scalar_one_or_none()
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc
        if model is None:
            return None
        return _to_customer_entity(model)


class SqlAlchemyServiceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_code(self, code: str) -> Service | None:
        statement = select(ServiceModel).where(ServiceModel.code == code)
        try:
            model = (await self._session.execute(statement)).scalar_one_or_none()
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc
        if model is None:
            return None
        return _to_service_entity(model)


class SqlAlchemyCustomerServiceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, customer_service: CustomerService) -> None:
        model = CustomerServiceModel(
            id=customer_service.id,
            customer_id=customer_service.customer_id,
            service_id=customer_service.service_id,
            status=customer_service.status.value,
            started_at=customer_service.started_at,
            ended_at=customer_service.ended_at,
            created_at=customer_service.created_at,
            updated_at=customer_service.updated_at,
        )
        self._session.add(model)
        try:
            await self._session.flush()
        except IntegrityError as exc:
            raise _map_integrity_error(exc) from exc
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc

    async def get_by_customer_and_service(
        self,
        customer_id: UUID,
        service_id: UUID,
    ) -> CustomerService | None:
        statement = select(CustomerServiceModel).where(
            CustomerServiceModel.customer_id == customer_id,
            CustomerServiceModel.service_id == service_id,
        )
        try:
            model = (await self._session.execute(statement)).scalar_one_or_none()
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc
        if model is None:
            return None
        return _to_customer_service_entity(model)

    async def update_status_and_dates(
        self,
        customer_service_id: UUID,
        status: CustomerServiceStatus,
        *,
        started_at: datetime | None | object = _UNSET,
        ended_at: datetime | None | object = _UNSET,
    ) -> None:
        try:
            model = await self._session.get(CustomerServiceModel, customer_service_id)
            if model is None:
                raise UnexpectedPersistenceError()
            model.status = status.value
            if started_at is not _UNSET:
                model.started_at = cast(datetime | None, started_at)
            if ended_at is not _UNSET:
                model.ended_at = cast(datetime | None, ended_at)
            model.updated_at = utc_now()
            await self._session.flush()
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc


class SqlAlchemyCustomerIntakeUnitOfWork:
    """Async SQLAlchemy-backed unit of work with one shared transaction."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self._intake_requests: SqlAlchemyCustomerIntakeRequestRepository | None = None
        self._customers: SqlAlchemyCustomerRepository | None = None
        self._services: SqlAlchemyServiceRepository | None = None
        self._customer_services: SqlAlchemyCustomerServiceRepository | None = None

    @property
    def intake_requests(self) -> SqlAlchemyCustomerIntakeRequestRepository:
        assert self._intake_requests is not None
        return self._intake_requests

    @property
    def customers(self) -> SqlAlchemyCustomerRepository:
        assert self._customers is not None
        return self._customers

    @property
    def services(self) -> SqlAlchemyServiceRepository:
        assert self._services is not None
        return self._services

    @property
    def customer_services(self) -> SqlAlchemyCustomerServiceRepository:
        assert self._customer_services is not None
        return self._customer_services

    async def __aenter__(self) -> SqlAlchemyCustomerIntakeUnitOfWork:
        self._session = self._session_factory()
        self._intake_requests = SqlAlchemyCustomerIntakeRequestRepository(self._session)
        self._customers = SqlAlchemyCustomerRepository(self._session)
        self._services = SqlAlchemyServiceRepository(self._session)
        self._customer_services = SqlAlchemyCustomerServiceRepository(self._session)
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        assert self._session is not None
        try:
            if exc_type is None:
                await self.commit()
            else:
                await self.rollback()
        finally:
            await self._session.close()
            self._session = None

    async def commit(self) -> None:
        assert self._session is not None
        try:
            await self._session.commit()
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc

    async def rollback(self) -> None:
        assert self._session is not None
        try:
            await self._session.rollback()
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc

    @asynccontextmanager
    async def savepoint(self) -> AsyncIterator[None]:
        assert self._session is not None
        try:
            async with self._session.begin_nested():
                yield
        except SQLAlchemyError as exc:
            raise UnexpectedPersistenceError() from exc


InMemoryCustomerIntakeRepository = InMemoryCustomerIntakeRequestRepository
