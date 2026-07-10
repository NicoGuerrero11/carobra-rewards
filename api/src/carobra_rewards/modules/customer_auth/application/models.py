from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(slots=True, frozen=True)
class RegisterCustomerCommand:
    curp: str
    first_name: str
    last_name: str
    email: str
    phone: str
    password: str
    confirm_password: str
    postal_code: str
    state: str
    city: str
    terms_accepted: bool
    terms_version: str


@dataclass(slots=True, frozen=True)
class LoginCommand:
    email: str
    password: str


@dataclass(slots=True, frozen=True)
class CustomerProfile:
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


@dataclass(slots=True, frozen=True)
class RegistrationResult:
    customer: CustomerProfile
    validation_id: UUID
    validation_status: str


@dataclass(slots=True, frozen=True)
class LoginResult:
    customer: CustomerProfile
    session_token: str
    expires_at: datetime


@dataclass(slots=True, frozen=True)
class CustomerValidationStatus:
    validation_id: UUID
    customer_id: UUID
    status: str
    registered_at: datetime
    next_checkpoint: str | None
    next_checkpoint_at: datetime | None
    last_checked_at: datetime | None
    last_check_outcome: str | None


class CustomerAuthError(Exception):
    """Base type for stable customer auth outcomes."""


class DuplicateEmailError(CustomerAuthError):
    pass


class DuplicateCurpError(CustomerAuthError):
    pass


class RewardsIdCollisionExhaustedError(CustomerAuthError):
    pass


class PasswordMismatchError(CustomerAuthError):
    pass


class PasswordValidationError(CustomerAuthError):
    pass


class TermsNotAcceptedError(CustomerAuthError):
    pass


class InvalidCredentialsError(CustomerAuthError):
    pass


class UnauthenticatedError(CustomerAuthError):
    pass


class CustomerValidationNotFoundError(CustomerAuthError):
    pass


class CustomerAuthPersistenceError(CustomerAuthError):
    pass
