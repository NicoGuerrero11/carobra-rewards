"""Persistence contracts for customer intake and customer lifecycle data."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from carobra_rewards.modules.customer_intake.domain.entities import (
    Customer,
    CustomerIntakeRequest,
    CustomerService,
    CustomerServiceStatus,
    IntakeProcessingStatus,
    Service,
)
from carobra_rewards.modules.customer_intake.domain.value_objects import JsonObject


class CustomerIntakeRequestRepository(Protocol):
    """Persist and query intake requests independently from customers."""

    async def save(self, intake_request: CustomerIntakeRequest) -> None: ...

    async def get_by_source_and_external_request_id(
        self,
        source: str,
        external_request_id: str,
    ) -> CustomerIntakeRequest | None: ...

    async def associate_customer(self, intake_request_id: UUID, customer_id: UUID) -> None: ...

    async def update_status(
        self,
        intake_request_id: UUID,
        processing_status: IntakeProcessingStatus,
        processing_details: JsonObject | None,
        *,
        processed_at: datetime | None = None,
    ) -> None: ...


class CustomerRepository(Protocol):
    """Persist and query customer identities."""

    async def create(self, customer: Customer) -> None: ...

    async def get_by_id(self, customer_id: UUID) -> Customer | None: ...

    async def get_by_rewards_id(self, rewards_id: str) -> Customer | None: ...

    async def get_by_curp(self, curp: str) -> Customer | None: ...


class ServiceRepository(Protocol):
    """Query service catalog entries."""

    async def get_by_code(self, code: str) -> Service | None: ...


class CustomerServiceRepository(Protocol):
    """Persist and query customer-service relations."""

    async def create(self, customer_service: CustomerService) -> None: ...

    async def get_by_customer_and_service(
        self,
        customer_id: UUID,
        service_id: UUID,
    ) -> CustomerService | None: ...

    async def update_status_and_dates(
        self,
        customer_service_id: UUID,
        status: CustomerServiceStatus,
        *,
        started_at: datetime | None = None,
        ended_at: datetime | None = None,
    ) -> None: ...
