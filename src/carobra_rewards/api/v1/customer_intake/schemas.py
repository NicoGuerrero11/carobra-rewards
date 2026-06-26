"""HTTP schemas for the provisional simulated customer intake endpoint."""

from __future__ import annotations

from email.utils import parseaddr
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from carobra_rewards.modules.customer_intake.application.commands import (
    ProcessSimulatedCustomerIntakeCommand,
)
from carobra_rewards.modules.customer_intake.application.results import (
    SimulatedCustomerIntakeResult,
)
from carobra_rewards.modules.customer_intake.domain.value_objects import JsonObject


def _validate_stripped(value: str, *, field_name: str, max_length: int) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{field_name} cannot be empty after trimming")
    if len(trimmed) > max_length:
        raise ValueError(f"{field_name} exceeds max length")
    return value


class CustomerIntakeRequest(BaseModel):
    """Provisional transport contract for the simulated intake flow."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "description": (
                "Functional but provisional endpoint. It only accepts "
                "`SISCA_SIMULATED`, and structural validity implies simulated "
                "approval only for this technical flow."
            ),
        },
    )

    source: Literal["SISCA_SIMULATED"] = Field(
        description="Provisional fixed source literal for the simulated flow."
    )
    external_request_id: str = Field(min_length=1, max_length=120)
    curp: str = Field(min_length=1, max_length=64)
    nss: str = Field(min_length=1, max_length=16)
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=254)
    phone: str | None = Field(default=None, max_length=32)
    postal_code: str | None = Field(default=None, max_length=16)

    @field_validator("external_request_id")
    @classmethod
    def validate_external_request_id(cls, value: str) -> str:
        return _validate_stripped(value, field_name="external_request_id", max_length=120)

    @field_validator("curp")
    @classmethod
    def validate_curp(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("curp cannot be empty after trimming")
        if len(trimmed.upper()) > 18:
            raise ValueError("curp exceeds max normalized length")
        return value

    @field_validator("nss")
    @classmethod
    def validate_nss(cls, value: str) -> str:
        return _validate_stripped(value, field_name="nss", max_length=16)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _validate_stripped(value, field_name="name", max_length=200)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < 3 or len(trimmed) > 254:
            raise ValueError("email length is invalid")
        _, parsed = parseaddr(trimmed)
        if parsed != trimmed or "@" not in trimmed:
            raise ValueError("email structure is invalid")
        return value

    @field_validator("phone", "postal_code")
    @classmethod
    def validate_optional_trimmed(cls, value: str | None, info) -> str | None:
        if value is None:
            return None
        return _validate_stripped(
            value,
            field_name=info.field_name,
            max_length=32 if info.field_name == "phone" else 16,
        )

    def to_command(self) -> ProcessSimulatedCustomerIntakeCommand:
        payload = self.model_dump()
        return ProcessSimulatedCustomerIntakeCommand(
            source=self.source,
            external_request_id=self.external_request_id.strip(),
            curp=self.curp,
            nss=self.nss.strip(),
            name=self.name.strip(),
            email=self.email.strip(),
            phone=None if self.phone is None else self.phone.strip(),
            postal_code=None if self.postal_code is None else self.postal_code.strip(),
            original_payload=payload_as_json(payload),
        )


def payload_as_json(payload: dict[str, object]) -> JsonObject:
    return payload  # type: ignore[return-value]


class CustomerIntakeResponse(BaseModel):
    """HTTP representation of a successful simulated intake result."""

    intake_request_id: str
    customer_id: str
    rewards_id: str
    status: Literal["APPROVED", "ALREADY_ACTIVE"]
    replayed: bool

    @classmethod
    def from_result(cls, result: SimulatedCustomerIntakeResult) -> CustomerIntakeResponse:
        return cls(
            intake_request_id=result.intake_request_id,
            customer_id=result.customer_id,
            rewards_id=result.rewards_id,
            status=result.status.value,
            replayed=result.replayed,
        )


class CustomerIntakeErrorResponse(BaseModel):
    """HTTP-safe inner error payload for documented intake failures."""

    code: str
    message: str


class CustomerIntakeErrorEnvelope(BaseModel):
    """Documented HTTP envelope for intake error responses."""

    detail: CustomerIntakeErrorResponse
