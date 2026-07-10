"""Unit of work contract for customer intake persistence."""

from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from typing import Protocol, Self

from carobra_rewards.modules.customer_intake.ports.repositories import (
    CustomerIntakeRequestRepository,
    CustomerRepository,
    CustomerServiceRepository,
    ServiceRepository,
)


class CustomerIntakeUnitOfWork(Protocol):
    """Coordinate repositories and transaction lifecycle without SQLAlchemy exposure."""

    @property
    def intake_requests(self) -> CustomerIntakeRequestRepository: ...

    @property
    def customers(self) -> CustomerRepository: ...

    @property
    def services(self) -> ServiceRepository: ...

    @property
    def customer_services(self) -> CustomerServiceRepository: ...

    async def __aenter__(self) -> Self: ...

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None: ...

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...

    def savepoint(self) -> AbstractAsyncContextManager[None]: ...
