from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, cast
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.modules.customer_intake.domain.entities import (
    Customer,
    CustomerIntakeRequest,
    CustomerService,
    CustomerServiceStatus,
    IntakeProcessingStatus,
    Service,
)
from carobra_rewards.modules.customer_intake.domain.value_objects import JsonObject
from carobra_rewards.modules.customer_intake.infrastructure.persistence.repositories import (
    SqlAlchemyCustomerIntakeRequestRepository,
    SqlAlchemyCustomerIntakeUnitOfWork,
    SqlAlchemyCustomerRepository,
    SqlAlchemyCustomerServiceRepository,
    SqlAlchemyServiceRepository,
)


class InjectedFailureError(RuntimeError):
    """Controlled failure used by integration tests to validate rollback."""


class AsyncBarrier:
    """Minimal one-shot barrier for coordinating concurrent test tasks."""

    def __init__(self, parties: int) -> None:
        self._parties = parties
        self._arrived = 0
        self._lock = asyncio.Lock()
        self._ready = asyncio.Event()

    async def wait(self) -> None:
        async with self._lock:
            self._arrived += 1
            if self._arrived == self._parties:
                self._ready.set()
        await asyncio.wait_for(self._ready.wait(), timeout=5)


class SequenceRewardsIdGenerator:
    def __init__(self, values: list[str]) -> None:
        self._values = values
        self.calls = 0

    def generate(self) -> str:
        value = self._values[self.calls]
        self.calls += 1
        return value


@dataclass(slots=True)
class RepositoryHooks:
    intake_requests: Callable[[SqlAlchemyCustomerIntakeRequestRepository], Any] | None = None
    customers: Callable[[SqlAlchemyCustomerRepository], Any] | None = None
    services: Callable[[SqlAlchemyServiceRepository], Any] | None = None
    customer_services: Callable[[SqlAlchemyCustomerServiceRepository], Any] | None = None


class HookedSqlAlchemyCustomerIntakeUnitOfWork(SqlAlchemyCustomerIntakeUnitOfWork):
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        hooks: RepositoryHooks | None = None,
    ) -> None:
        super().__init__(session_factory)
        self._hooks = hooks or RepositoryHooks()

    async def __aenter__(self) -> HookedSqlAlchemyCustomerIntakeUnitOfWork:
        await super().__aenter__()
        if self._hooks.intake_requests is not None:
            self._intake_requests = cast(
                SqlAlchemyCustomerIntakeRequestRepository,
                self._hooks.intake_requests(self.intake_requests),
            )
        if self._hooks.customers is not None:
            self._customers = cast(
                SqlAlchemyCustomerRepository,
                self._hooks.customers(self.customers),
            )
        if self._hooks.services is not None:
            self._services = cast(
                SqlAlchemyServiceRepository,
                self._hooks.services(self.services),
            )
        if self._hooks.customer_services is not None:
            self._customer_services = cast(
                SqlAlchemyCustomerServiceRepository,
                self._hooks.customer_services(self.customer_services),
            )
        return self


class IntakeRequestRepositoryProxy:
    def __init__(self, delegate: SqlAlchemyCustomerIntakeRequestRepository) -> None:
        self._delegate = delegate

    async def save(self, intake_request: CustomerIntakeRequest) -> None:
        await self._delegate.save(intake_request)

    async def get_by_source_and_external_request_id(
        self,
        source: str,
        external_request_id: str,
    ) -> CustomerIntakeRequest | None:
        return await self._delegate.get_by_source_and_external_request_id(
            source,
            external_request_id,
        )

    async def associate_customer(self, intake_request_id: UUID, customer_id: UUID) -> None:
        await self._delegate.associate_customer(intake_request_id, customer_id)

    async def update_status(
        self,
        intake_request_id: UUID,
        processing_status: IntakeProcessingStatus,
        processing_details: JsonObject | None,
        *,
        processed_at: datetime | None | object = None,
    ) -> None:
        if processed_at is None:
            await self._delegate.update_status(
                intake_request_id,
                processing_status,
                processing_details,
            )
            return
        await self._delegate.update_status(
            intake_request_id,
            processing_status,
            processing_details,
            processed_at=processed_at,
        )


class BlockingIntakeRequestRepository(IntakeRequestRepositoryProxy):
    def __init__(
        self,
        delegate: SqlAlchemyCustomerIntakeRequestRepository,
        *,
        barrier: AsyncBarrier,
    ) -> None:
        super().__init__(delegate)
        self._barrier = barrier
        self._save_calls = 0

    async def save(self, intake_request: CustomerIntakeRequest) -> None:
        self._save_calls += 1
        if self._save_calls == 1:
            await self._barrier.wait()
        await super().save(intake_request)


class FailingAfterIntakeSaveRepository(IntakeRequestRepositoryProxy):
    async def save(self, intake_request: CustomerIntakeRequest) -> None:
        await super().save(intake_request)
        raise InjectedFailureError("fail_after_intake_save")


class FailingAfterAssociateCustomerRepository(IntakeRequestRepositoryProxy):
    async def associate_customer(self, intake_request_id: UUID, customer_id: UUID) -> None:
        await super().associate_customer(intake_request_id, customer_id)
        raise InjectedFailureError("fail_after_associate_customer")


class CustomerRepositoryProxy:
    def __init__(self, delegate: SqlAlchemyCustomerRepository) -> None:
        self._delegate = delegate

    async def create(self, customer: Customer) -> None:
        await self._delegate.create(customer)

    async def get_by_id(self, customer_id: UUID) -> Customer | None:
        return await self._delegate.get_by_id(customer_id)

    async def get_by_rewards_id(self, rewards_id: str) -> Customer | None:
        return await self._delegate.get_by_rewards_id(rewards_id)

    async def get_by_curp(self, curp: str) -> Customer | None:
        return await self._delegate.get_by_curp(curp)


class BlockingCustomerRepository(CustomerRepositoryProxy):
    def __init__(
        self,
        delegate: SqlAlchemyCustomerRepository,
        *,
        barrier: AsyncBarrier,
    ) -> None:
        super().__init__(delegate)
        self._barrier = barrier
        self._create_calls = 0

    async def create(self, customer: Customer) -> None:
        self._create_calls += 1
        if self._create_calls == 1:
            await self._barrier.wait()
        await super().create(customer)


class FailingAfterCustomerCreateRepository(CustomerRepositoryProxy):
    async def create(self, customer: Customer) -> None:
        await super().create(customer)
        raise InjectedFailureError("fail_after_customer_create")


class ServiceRepositoryProxy:
    def __init__(self, delegate: SqlAlchemyServiceRepository) -> None:
        self._delegate = delegate

    async def get_by_code(self, code: str) -> Service | None:
        return await self._delegate.get_by_code(code)


class CustomerServiceRepositoryProxy:
    def __init__(self, delegate: SqlAlchemyCustomerServiceRepository) -> None:
        self._delegate = delegate

    async def create(self, customer_service: CustomerService) -> None:
        await self._delegate.create(customer_service)

    async def get_by_customer_and_service(
        self,
        customer_id: UUID,
        service_id: UUID,
    ) -> CustomerService | None:
        return await self._delegate.get_by_customer_and_service(customer_id, service_id)

    async def update_status_and_dates(
        self,
        customer_service_id: UUID,
        status: CustomerServiceStatus,
        *,
        started_at: datetime | None = None,
        ended_at: datetime | None = None,
    ) -> None:
        await self._delegate.update_status_and_dates(
            customer_service_id,
            status,
            started_at=started_at,
            ended_at=ended_at,
        )


class FailingAfterCustomerServiceCreateRepository(CustomerServiceRepositoryProxy):
    async def create(self, customer_service: CustomerService) -> None:
        await super().create(customer_service)
        raise InjectedFailureError("fail_after_customer_service_create")
