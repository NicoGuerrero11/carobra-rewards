"""HTTP schemas for the SISCA customer intake endpoint."""

from __future__ import annotations

from datetime import date
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


def _parse_iso_date(value: str, *, field_name: str) -> date:
    trimmed = value.strip()
    if len(trimmed) != 10:
        raise ValueError(f"{field_name} must use YYYY-MM-DD")
    try:
        return date.fromisoformat(trimmed)
    except ValueError as exc:
        raise ValueError(f"{field_name} must use YYYY-MM-DD") from exc


class CustomerIntakeRequest(BaseModel):
    """Transport contract for the target SISCA intake flow."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "description": (
                "Target SISCA -> Rewards intake contract on the existing "
                "`POST /api/v1/customers/intake` endpoint."
            ),
        },
    )

    external_request_id: str = Field(min_length=1, max_length=120)
    curp: str = Field(min_length=1, max_length=64)
    nss: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=1, max_length=100)
    apellido_paterno: str = Field(min_length=1, max_length=100)
    apellido_materno: str = Field(min_length=1, max_length=100)
    correo_electronico: str = Field(min_length=3, max_length=254)
    fecha_de_nacimiento: str = Field(min_length=10, max_length=10)
    advisor_identifier: str = Field(
        min_length=1,
        max_length=120,
        description="Canonical placeholder for the mandatory advisor identifier concept.",
    )
    tipo_de_movimiento: str = Field(min_length=1, max_length=80)
    estatus_sf: str = Field(min_length=1, max_length=80)
    fecha_de_traspaso: str = Field(min_length=10, max_length=10)
    celular: str | None = Field(default=None, max_length=32)
    codigo_postal: str | None = Field(default=None, max_length=16)
    estado: str | None = Field(default=None, max_length=100)
    ciudad: str | None = Field(default=None, max_length=100)

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

    @field_validator("nombre", "apellido_paterno", "apellido_materno", "advisor_identifier")
    @classmethod
    def validate_required_names(cls, value: str, info) -> str:
        max_length = 120 if info.field_name == "advisor_identifier" else 100
        return _validate_stripped(value, field_name=info.field_name, max_length=max_length)

    @field_validator("correo_electronico")
    @classmethod
    def validate_email(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < 3 or len(trimmed) > 254:
            raise ValueError("correo_electronico length is invalid")
        _, parsed = parseaddr(trimmed)
        if parsed != trimmed or "@" not in trimmed:
            raise ValueError("correo_electronico structure is invalid")
        return value

    @field_validator("fecha_de_nacimiento", "fecha_de_traspaso")
    @classmethod
    def validate_iso_dates(cls, value: str, info) -> str:
        _parse_iso_date(value, field_name=info.field_name)
        return value

    @field_validator("tipo_de_movimiento", "estatus_sf")
    @classmethod
    def validate_business_strings(cls, value: str, info) -> str:
        return _validate_stripped(value, field_name=info.field_name, max_length=80)

    @field_validator("celular", "codigo_postal", "estado", "ciudad")
    @classmethod
    def validate_optional_trimmed(cls, value: str | None, info) -> str | None:
        if value is None:
            return None
        max_length = 32 if info.field_name == "celular" else 16
        if info.field_name in {"estado", "ciudad"}:
            max_length = 100
        return _validate_stripped(value, field_name=info.field_name, max_length=max_length)

    def to_command(self) -> ProcessSimulatedCustomerIntakeCommand:
        payload = self.model_dump()
        return ProcessSimulatedCustomerIntakeCommand(
            source="SISCA",
            external_request_id=self.external_request_id.strip(),
            curp=self.curp,
            nss=self.nss.strip(),
            first_name=self.nombre.strip(),
            paternal_last_name=self.apellido_paterno.strip(),
            maternal_last_name=self.apellido_materno.strip(),
            email=self.correo_electronico.strip(),
            birth_date=_parse_iso_date(self.fecha_de_nacimiento, field_name="fecha_de_nacimiento"),
            advisor_identifier=self.advisor_identifier.strip(),
            movement_type=self.tipo_de_movimiento.strip(),
            sf_status=self.estatus_sf.strip(),
            transfer_date=_parse_iso_date(self.fecha_de_traspaso, field_name="fecha_de_traspaso"),
            phone=None if self.celular is None else self.celular.strip(),
            postal_code=None if self.codigo_postal is None else self.codigo_postal.strip(),
            state=None if self.estado is None else self.estado.strip(),
            city=None if self.ciudad is None else self.ciudad.strip(),
            original_payload=payload_as_json(payload),
        )


def payload_as_json(payload: dict[str, object]) -> JsonObject:
    return payload  # type: ignore[return-value]


class CustomerIntakeResponse(BaseModel):
    """HTTP representation of a classified intake result."""

    intake_request_id: str
    customer_id: str | None
    rewards_id: str | None
    status: Literal["accepted", "not_eligible", "idempotent_duplicate"]
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
