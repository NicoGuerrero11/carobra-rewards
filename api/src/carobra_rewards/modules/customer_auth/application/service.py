from __future__ import annotations

import hashlib
import secrets
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.modules.customer_auth.application.models import (
    CustomerAuthPersistenceError,
    CustomerProfile,
    CustomerValidationNotFoundError,
    CustomerValidationStatus,
    DuplicateCurpError,
    DuplicateEmailError,
    InvalidCredentialsError,
    LoginCommand,
    LoginResult,
    PasswordMismatchError,
    RegisterCustomerCommand,
    RegistrationResult,
    RewardsIdCollisionExhaustedError,
    TermsNotAcceptedError,
    UnauthenticatedError,
)
from carobra_rewards.modules.customer_auth.domain.passwords import (
    hash_password,
    verify_password,
)
from carobra_rewards.modules.customer_intake.domain.value_objects import normalize_curp
from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    AuthSessionModel,
    AuthUserModel,
    CustomerConsentModel,
    CustomerModel,
)
from carobra_rewards.modules.customer_intake.infrastructure.rewards_id_generator import (
    TokenHexRewardsIdGenerator,
)
from carobra_rewards.modules.sisca_validation.domain.models import SiscaValidation
from carobra_rewards.modules.sisca_validation.infrastructure.persistence.models import (
    SiscaValidationModel,
)


class RewardsIdGenerator(Protocol):
    def generate(self) -> str: ...


ValidationFactory = Callable[[UUID, datetime], SiscaValidation]
Clock = Callable[[], datetime]
_MAX_REWARDS_ID_ATTEMPTS = 3


def utc_now() -> datetime:
    return datetime.now(UTC)


def normalize_email(email: str) -> str:
    return email.strip().lower()


class CustomerAuthService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        session_ttl: timedelta,
        rewards_id_generator: RewardsIdGenerator | None = None,
        validation_factory: ValidationFactory | None = None,
        clock: Clock = utc_now,
    ) -> None:
        self._session_factory = session_factory
        self._session_ttl = session_ttl
        self._rewards_id_generator = rewards_id_generator or TokenHexRewardsIdGenerator()
        self._validation_factory = validation_factory or _create_validation
        self._clock = clock

    async def register(self, command: RegisterCustomerCommand) -> RegistrationResult:
        if command.password != command.confirm_password:
            raise PasswordMismatchError()
        if not command.terms_accepted or not command.terms_version.strip():
            raise TermsNotAcceptedError()

        now = self._clock().astimezone(UTC)
        password_hash = hash_password(command.password)
        for attempt in range(_MAX_REWARDS_ID_ATTEMPTS):
            try:
                return await self._register_once(command, now, password_hash)
            except IntegrityError as exc:
                match _constraint_name(exc):
                    case "uq_auth_users_email":
                        raise DuplicateEmailError() from exc
                    case "uq_customers_curp":
                        raise DuplicateCurpError() from exc
                    case "uq_customers_rewards_id":
                        if attempt + 1 == _MAX_REWARDS_ID_ATTEMPTS:
                            raise RewardsIdCollisionExhaustedError() from exc
                    case _:
                        raise CustomerAuthPersistenceError() from exc
            except SQLAlchemyError as exc:
                raise CustomerAuthPersistenceError() from exc
        raise AssertionError("Rewards ID retry loop exited unexpectedly")

    async def _register_once(
        self,
        command: RegisterCustomerCommand,
        now: datetime,
        password_hash: str,
    ) -> RegistrationResult:
        auth_user_id = uuid4()
        customer_id = uuid4()
        auth_user = AuthUserModel(
            id=auth_user_id,
            email=normalize_email(command.email),
            password_hash=password_hash,
            password_updated_at=now,
            email_verified_at=None,
            created_at=now,
            updated_at=now,
        )
        customer = CustomerModel(
            id=customer_id,
            auth_user_id=auth_user_id,
            rewards_id=self._rewards_id_generator.generate(),
            curp=normalize_curp(command.curp),
            first_name=command.first_name.strip(),
            last_name=command.last_name.strip(),
            email=normalize_email(command.email),
            phone=command.phone.strip(),
            postal_code=command.postal_code.strip(),
            state=command.state.strip(),
            city=command.city.strip(),
            customer_status="PENDING_VALIDATION",
            onboarding_status="COMPLETED",
            created_at=now,
            updated_at=now,
        )
        consent = CustomerConsentModel(
            id=uuid4(),
            customer_id=customer_id,
            consent_type="TERMS_AND_CONDITIONS",
            accepted_at=now,
            terms_version=command.terms_version.strip(),
            audit_metadata={"source": "api_registration"},
            created_at=now,
            updated_at=now,
        )

        async with self._session_factory() as session, session.begin():
            session.add(auth_user)
            await session.flush()
            session.add(customer)
            await session.flush()
            session.add(consent)
            await session.flush()
            validation = self._validation_factory(customer_id, now)
            session.add(_validation_model(validation))
            await session.flush()

        return RegistrationResult(
            customer=_profile(customer),
            validation_id=validation.id,
            validation_status=validation.status.value,
        )

    async def login(self, command: LoginCommand) -> LoginResult:
        now = self._clock().astimezone(UTC)
        async with self._session_factory() as session:
            statement = (
                select(AuthUserModel, CustomerModel)
                .join(CustomerModel, CustomerModel.auth_user_id == AuthUserModel.id)
                .where(AuthUserModel.email == normalize_email(command.email))
            )
            try:
                row = (await session.execute(statement)).one_or_none()
            except SQLAlchemyError as exc:
                raise CustomerAuthPersistenceError() from exc
            if row is None or not verify_password(
                command.password, row.AuthUserModel.password_hash
            ):
                raise InvalidCredentialsError()

            session_token = secrets.token_urlsafe(32)
            expires_at = now + self._session_ttl
            session.add(
                AuthSessionModel(
                    id=uuid4(),
                    auth_user_id=row.AuthUserModel.id,
                    token_hash=_token_hash(session_token),
                    expires_at=expires_at,
                    revoked_at=None,
                    created_at=now,
                    updated_at=now,
                )
            )
            try:
                await session.commit()
            except SQLAlchemyError as exc:
                raise CustomerAuthPersistenceError() from exc
            return LoginResult(
                customer=_profile(row.CustomerModel),
                session_token=session_token,
                expires_at=expires_at,
            )

    async def get_current_customer(self, session_token: str | None) -> CustomerProfile:
        _, customer = await self._authenticated_models(session_token)
        return _profile(customer)

    async def logout(self, session_token: str | None) -> None:
        if not session_token:
            return
        now = self._clock().astimezone(UTC)
        async with self._session_factory() as session:
            statement = select(AuthSessionModel).where(
                AuthSessionModel.token_hash == _token_hash(session_token),
                AuthSessionModel.revoked_at.is_(None),
            )
            try:
                auth_session = (await session.execute(statement)).scalar_one_or_none()
                if auth_session is not None:
                    auth_session.revoked_at = now
                    auth_session.updated_at = now
                    await session.commit()
            except SQLAlchemyError as exc:
                raise CustomerAuthPersistenceError() from exc

    async def get_validation_status(
        self,
        session_token: str | None,
    ) -> CustomerValidationStatus:
        _, customer = await self._authenticated_models(session_token)
        async with self._session_factory() as session:
            statement = select(SiscaValidationModel).where(
                SiscaValidationModel.customer_id == customer.id
            )
            try:
                validation = (await session.execute(statement)).scalar_one_or_none()
            except SQLAlchemyError as exc:
                raise CustomerAuthPersistenceError() from exc
        if validation is None:
            raise CustomerValidationNotFoundError()
        return CustomerValidationStatus(
            validation_id=validation.id,
            customer_id=validation.customer_id,
            status=validation.status,
            registered_at=validation.registered_at,
            next_checkpoint=validation.next_checkpoint,
            next_checkpoint_at=validation.next_checkpoint_at,
            last_checked_at=validation.last_checked_at,
            last_check_outcome=validation.last_check_outcome,
        )

    async def _authenticated_models(
        self,
        session_token: str | None,
    ) -> tuple[AuthUserModel, CustomerModel]:
        if not session_token:
            raise UnauthenticatedError()
        now = self._clock().astimezone(UTC)
        async with self._session_factory() as session:
            statement = (
                select(AuthUserModel, CustomerModel)
                .join(AuthSessionModel, AuthSessionModel.auth_user_id == AuthUserModel.id)
                .join(CustomerModel, CustomerModel.auth_user_id == AuthUserModel.id)
                .where(
                    AuthSessionModel.token_hash == _token_hash(session_token),
                    AuthSessionModel.revoked_at.is_(None),
                    AuthSessionModel.expires_at > now,
                )
            )
            try:
                row = (await session.execute(statement)).one_or_none()
            except SQLAlchemyError as exc:
                raise CustomerAuthPersistenceError() from exc
        if row is None:
            raise UnauthenticatedError()
        return row.AuthUserModel, row.CustomerModel


def _profile(customer: CustomerModel) -> CustomerProfile:
    return CustomerProfile(
        id=customer.id,
        rewards_id=customer.rewards_id,
        curp=customer.curp,
        first_name=customer.first_name,
        last_name=customer.last_name,
        email=customer.email,
        phone=customer.phone,
        postal_code=customer.postal_code,
        state=customer.state,
        city=customer.city,
        customer_status=customer.customer_status,
        onboarding_status=customer.onboarding_status,
    )


def _create_validation(customer_id: UUID, registered_at: datetime) -> SiscaValidation:
    return SiscaValidation.create(customer_id=customer_id, registered_at=registered_at)


def _validation_model(validation: SiscaValidation) -> SiscaValidationModel:
    return SiscaValidationModel(
        id=validation.id,
        customer_id=validation.customer_id,
        status=validation.status.value,
        registered_at=validation.registered_at,
        h24_due_at=validation.h24_due_at,
        d3_due_at=validation.d3_due_at,
        d5_due_at=validation.d5_due_at,
        next_checkpoint=(
            None if validation.next_checkpoint is None else validation.next_checkpoint.value
        ),
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


def _token_hash(session_token: str) -> str:
    return hashlib.sha256(session_token.encode("utf-8")).hexdigest()


def _constraint_name(error: IntegrityError) -> str | None:
    candidates = (
        getattr(error, "orig", None),
        getattr(getattr(error, "orig", None), "__cause__", None),
        getattr(getattr(error, "orig", None), "__context__", None),
    )
    for candidate in candidates:
        if candidate is None:
            continue
        diagnostic = getattr(candidate, "diag", None)
        name = cast(str | None, getattr(diagnostic, "constraint_name", None))
        if name:
            return name
        message = str(candidate)
        for known_name in (
            "uq_auth_users_email",
            "uq_customers_curp",
            "uq_customers_rewards_id",
        ):
            if known_name in message:
                return known_name
    return None
