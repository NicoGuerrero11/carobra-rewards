from __future__ import annotations

import re
from dataclasses import asdict
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from carobra_rewards.modules.customer_auth.application.models import (
    CustomerProfile,
    CustomerValidationStatus,
    LoginCommand,
    RegisterCustomerCommand,
    RegistrationResult,
)

_CURP_PATTERN = re.compile(r"^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$")
_EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    curp: str = Field(min_length=18, max_length=18)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=254)
    phone: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)
    confirm_password: str = Field(min_length=1, max_length=128)
    postal_code: str = Field(min_length=1, max_length=16)
    state: str = Field(min_length=1, max_length=100)
    city: str = Field(min_length=1, max_length=100)
    terms_accepted: bool = False
    terms_version: str = Field(min_length=1, max_length=64)

    @field_validator("curp")
    @classmethod
    def validate_curp(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not _CURP_PATTERN.fullmatch(normalized):
            raise ValueError("CURP must use the canonical 18-character format")
        return normalized

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _validated_email(value)

    @field_validator(
        "first_name",
        "last_name",
        "phone",
        "postal_code",
        "state",
        "city",
        "terms_version",
    )
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Field cannot be blank")
        return normalized

    def to_command(self) -> RegisterCustomerCommand:
        return RegisterCustomerCommand(**self.model_dump())


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _validated_email(value)

    def to_command(self) -> LoginCommand:
        return LoginCommand(**self.model_dump())


class CustomerProfileResponse(BaseModel):
    id: UUID
    rewards_id: str
    curp: str
    first_name: str
    last_name: str
    email: str
    phone: str
    postal_code: str
    state: str
    city: str
    customer_status: str
    onboarding_status: str

    @classmethod
    def from_profile(cls, profile: CustomerProfile) -> CustomerProfileResponse:
        return cls(**asdict(profile))


class RegistrationResponse(BaseModel):
    customer: CustomerProfileResponse
    validation_id: UUID
    validation_status: str

    @classmethod
    def from_result(cls, result: RegistrationResult) -> RegistrationResponse:
        return cls(
            customer=CustomerProfileResponse.from_profile(result.customer),
            validation_id=result.validation_id,
            validation_status=result.validation_status,
        )


class LoginResponse(BaseModel):
    customer: CustomerProfileResponse
    expires_at: datetime


class CustomerValidationStatusResponse(BaseModel):
    validation_id: UUID
    customer_id: UUID
    status: str
    registered_at: datetime
    next_checkpoint: str | None
    next_checkpoint_at: datetime | None
    last_checked_at: datetime | None
    last_check_outcome: str | None

    @classmethod
    def from_result(
        cls,
        result: CustomerValidationStatus,
    ) -> CustomerValidationStatusResponse:
        return cls(**asdict(result))


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorEnvelope(BaseModel):
    detail: ErrorDetail


ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorEnvelope},
    404: {"model": ErrorEnvelope},
    409: {"model": ErrorEnvelope},
    422: {"model": ErrorEnvelope},
    503: {"model": ErrorEnvelope},
}


def _validated_email(value: str) -> str:
    normalized = value.strip().lower()
    if not _EMAIL_PATTERN.fullmatch(normalized):
        raise ValueError("Email must be valid")
    return normalized
