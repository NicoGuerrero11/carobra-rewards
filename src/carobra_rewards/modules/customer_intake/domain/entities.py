"""Domain entities and enums for customer intake persistence."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from carobra_rewards.modules.customer_intake.domain.value_objects import JsonObject, normalize_curp


class IntakeProcessingStatus(StrEnum):
    RECEIVED = "RECEIVED"
    PROCESSING = "PROCESSING"
    INCOMPLETE = "INCOMPLETE"
    NOT_APPROVED = "NOT_APPROVED"
    NOT_ELIGIBLE = "NOT_ELIGIBLE"
    ELIGIBILITY_PENDING = "ELIGIBILITY_PENDING"
    APPROVED = "APPROVED"
    ALREADY_ACTIVE = "ALREADY_ACTIVE"
    IDENTITY_CONFLICT = "IDENTITY_CONFLICT"


class CustomerStatus(StrEnum):
    PENDING_ONBOARDING = "PENDING_ONBOARDING"
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    BLOCKED = "BLOCKED"


class OnboardingStatus(StrEnum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"


class CustomerServiceStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ENDED = "ENDED"


@dataclass(slots=True, frozen=True)
class CustomerIntakeRequest:
    id: UUID
    source: str
    external_request_id: str
    curp: str
    processing_status: IntakeProcessingStatus
    processing_details: JsonObject | None
    original_payload: JsonObject
    customer_id: UUID | None
    received_at: datetime
    processed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def create(
        cls,
        *,
        source: str,
        external_request_id: str,
        curp: str,
        processing_status: IntakeProcessingStatus,
        original_payload: JsonObject,
        processing_details: JsonObject | None = None,
        customer_id: UUID | None = None,
        received_at: datetime,
        processed_at: datetime | None = None,
        created_at: datetime,
        updated_at: datetime,
        id: UUID | None = None,
    ) -> CustomerIntakeRequest:
        return cls(
            id=id or uuid4(),
            source=source,
            external_request_id=external_request_id,
            curp=normalize_curp(curp),
            processing_status=processing_status,
            processing_details=processing_details,
            original_payload=original_payload,
            customer_id=customer_id,
            received_at=received_at,
            processed_at=processed_at,
            created_at=created_at,
            updated_at=updated_at,
        )


@dataclass(slots=True, frozen=True)
class Customer:
    id: UUID
    rewards_id: str
    curp: str
    nss: str
    name: str
    email: str
    phone: str | None
    postal_code: str | None
    customer_status: CustomerStatus
    onboarding_status: OnboardingStatus
    created_at: datetime
    updated_at: datetime

    @classmethod
    def create(
        cls,
        *,
        rewards_id: str,
        curp: str,
        nss: str,
        name: str,
        email: str,
        phone: str | None,
        postal_code: str | None,
        customer_status: CustomerStatus,
        onboarding_status: OnboardingStatus,
        created_at: datetime,
        updated_at: datetime,
        id: UUID | None = None,
    ) -> Customer:
        return cls(
            id=id or uuid4(),
            rewards_id=rewards_id,
            curp=normalize_curp(curp),
            nss=nss,
            name=name,
            email=email,
            phone=phone,
            postal_code=postal_code,
            customer_status=customer_status,
            onboarding_status=onboarding_status,
            created_at=created_at,
            updated_at=updated_at,
        )


@dataclass(slots=True, frozen=True)
class Service:
    id: UUID
    code: str
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def create(
        cls,
        *,
        code: str,
        name: str,
        is_active: bool,
        created_at: datetime,
        updated_at: datetime,
        id: UUID | None = None,
    ) -> Service:
        return cls(
            id=id or uuid4(),
            code=code,
            name=name,
            is_active=is_active,
            created_at=created_at,
            updated_at=updated_at,
        )


@dataclass(slots=True, frozen=True)
class CustomerService:
    id: UUID
    customer_id: UUID
    service_id: UUID
    status: CustomerServiceStatus
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def create(
        cls,
        *,
        customer_id: UUID,
        service_id: UUID,
        status: CustomerServiceStatus,
        started_at: datetime | None,
        ended_at: datetime | None,
        created_at: datetime,
        updated_at: datetime,
        id: UUID | None = None,
    ) -> CustomerService:
        return cls(
            id=id or uuid4(),
            customer_id=customer_id,
            service_id=service_id,
            status=status,
            started_at=started_at,
            ended_at=ended_at,
            created_at=created_at,
            updated_at=updated_at,
        )


@dataclass(slots=True, frozen=True)
class CustomerIntakeSubmission:
    """Application-facing submission snapshot used by the provisional preview flow."""

    external_request_id: str
    curp: str
    name: str
    email: str
    source: str = "PREVIEW"
    original_payload: JsonObject = field(default_factory=dict)
