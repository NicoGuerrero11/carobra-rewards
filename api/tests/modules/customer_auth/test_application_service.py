from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.modules.customer_auth.application.models import (
    DuplicateCurpError,
    DuplicateEmailError,
    InvalidCredentialsError,
    LoginCommand,
    PasswordMismatchError,
    RegisterCustomerCommand,
    RewardsIdCollisionExhaustedError,
    TermsNotAcceptedError,
    UnauthenticatedError,
)
from carobra_rewards.modules.customer_auth.application.service import CustomerAuthService
from carobra_rewards.modules.customer_auth.domain.passwords import verify_password
from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    AuthSessionModel,
    AuthUserModel,
    CustomerConsentModel,
    CustomerModel,
    CustomerServiceModel,
)
from carobra_rewards.modules.sisca_validation.application.models import (
    ExecuteValidationCheckCommand,
)
from carobra_rewards.modules.sisca_validation.application.service import (
    ExecuteSiscaValidationCheck,
)
from carobra_rewards.modules.sisca_validation.domain.models import (
    FoundSiscaValidation,
    SiscaGatewayResult,
    SiscaNoInformation,
    SiscaValidationRequest,
)
from carobra_rewards.modules.sisca_validation.infrastructure.persistence.models import (
    SiscaValidationCheckModel,
    SiscaValidationModel,
)
from carobra_rewards.modules.sisca_validation.infrastructure.persistence.repositories import (
    SqlAlchemySiscaValidationUnitOfWork,
)

NOW = datetime(2026, 7, 9, 23, 30, tzinfo=UTC)


class FixedRewardsIdGenerator:
    def __init__(self) -> None:
        self.calls = 0

    def generate(self) -> str:
        self.calls += 1
        return f"RWD-fixed-{self.calls}"


class SequenceRewardsIdGenerator:
    def __init__(self, values: list[str]) -> None:
        self._values = values
        self.calls = 0

    def generate(self) -> str:
        value = self._values[min(self.calls, len(self._values) - 1)]
        self.calls += 1
        return value


class RecordingSiscaGateway:
    def __init__(self, result: SiscaGatewayResult) -> None:
        self.result = result
        self.requests: list[SiscaValidationRequest] = []

    async def query(self, request: SiscaValidationRequest) -> SiscaGatewayResult:
        self.requests.append(request)
        return self.result


def _command(**overrides: object) -> RegisterCustomerCommand:
    data: dict[str, object] = {
        "curp": "ABCD123456HMNLRS09",
        "first_name": "Ada",
        "last_name": "Lovelace Byron",
        "email": " Ada@Example.COM ",
        "phone": "5551234567",
        "password": "correct-horse-7",
        "confirm_password": "correct-horse-7",
        "postal_code": "01010",
        "state": "CDMX",
        "city": "Ciudad de Mexico",
        "terms_accepted": True,
        "terms_version": "2026-07",
    }
    data.update(overrides)
    return RegisterCustomerCommand(**data)  # type: ignore[arg-type]


def _service(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    validation_factory=None,
    rewards_id_generator=None,
    initial_validation_check=None,
) -> CustomerAuthService:
    return CustomerAuthService(
        session_factory,
        session_ttl=timedelta(days=7),
        rewards_id_generator=rewards_id_generator or FixedRewardsIdGenerator(),
        validation_factory=validation_factory,
        initial_validation_check=initial_validation_check,
        clock=lambda: NOW,
    )


def _initial_validation_check(
    session_factory: async_sessionmaker[AsyncSession],
    gateway: RecordingSiscaGateway,
):
    execute = ExecuteSiscaValidationCheck(
        unit_of_work=SqlAlchemySiscaValidationUnitOfWork(session_factory),
        gateway=gateway,
        known_movement_types=frozenset({"TRASPASO"}),
        allowed_movement_types=frozenset({"TRASPASO"}),
        minimum_transfer_date=date(2026, 7, 1),
        max_retries=0,
        clock=lambda: NOW,
    )

    async def run(validation_id):
        return await execute(
            ExecuteValidationCheckCommand(
                validation_id=validation_id,
                checkpoint=None,
                manual=True,
            )
        )

    return run


@pytest.mark.integration
@pytest.mark.asyncio
async def test_registration_persists_auth_customer_consent_and_pending_validation_atomically(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    result = await _service(postgres_session_factory).register(_command())

    async with postgres_session_factory() as session:
        auth_user = await session.scalar(select(AuthUserModel))
        customer = await session.scalar(select(CustomerModel))
        consent = await session.scalar(select(CustomerConsentModel))
        validation = await session.scalar(select(SiscaValidationModel))

    assert auth_user is not None
    assert auth_user.email == "ada@example.com"
    assert verify_password("correct-horse-7", auth_user.password_hash)
    assert "correct-horse-7" not in auth_user.password_hash
    assert customer is not None and customer.auth_user_id == auth_user.id
    assert customer.id == result.customer.id
    assert customer.customer_status == "PENDING_VALIDATION"
    assert customer.onboarding_status == "COMPLETED"
    assert consent is not None and consent.terms_version == "2026-07"
    assert validation is not None and validation.status == "PENDING"
    assert validation.customer_id == customer.id


@pytest.mark.integration
@pytest.mark.asyncio
async def test_registration_queries_sisca_and_returns_validated_status(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    gateway = RecordingSiscaGateway(
        FoundSiscaValidation(
            movement_type="TRASPASO",
            sf_status="Certificado",
            transfer_date=date(2026, 7, 2),
        )
    )

    service = _service(
        postgres_session_factory,
        initial_validation_check=_initial_validation_check(postgres_session_factory, gateway),
    )
    registration = await service.register(_command())
    result = await service.run_initial_validation(registration)

    async with postgres_session_factory() as session:
        customer = await session.get(CustomerModel, result.customer.id)
        validation = await session.get(SiscaValidationModel, result.validation_id)
        check = await session.scalar(select(SiscaValidationCheckModel))
        relation = await session.scalar(
            select(CustomerServiceModel).where(
                CustomerServiceModel.customer_id == result.customer.id
            )
        )

    assert len(gateway.requests) == 1
    assert gateway.requests[0].curp == "ABCD123456HMNLRS09"
    assert result.validation_status == "VALIDATED"
    assert result.customer.customer_status == "ACTIVE"
    assert customer is not None and customer.customer_status == "ACTIVE"
    assert validation is not None and validation.status == "VALIDATED"
    assert relation is not None and relation.status == "ACTIVE"
    assert check is not None
    assert check.check_type == "MANUAL"
    assert check.checkpoint is None
    assert check.outcome == "MATCH_VALIDATED"
    assert check.raw_movement_type == "TRASPASO"
    assert check.raw_sf_status == "Certificado"
    assert check.raw_transfer_date == date(2026, 7, 2)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_registration_no_information_stays_invited_and_preserves_h24(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    gateway = RecordingSiscaGateway(SiscaNoInformation())

    service = _service(
        postgres_session_factory,
        initial_validation_check=_initial_validation_check(postgres_session_factory, gateway),
    )
    registration = await service.register(_command())
    result = await service.run_initial_validation(registration)

    async with postgres_session_factory() as session:
        validation = await session.get(SiscaValidationModel, result.validation_id)
        check = await session.scalar(select(SiscaValidationCheckModel))

    assert len(gateway.requests) == 1
    assert result.validation_status == "PENDING"
    assert result.customer.customer_status == "PENDING_VALIDATION"
    assert validation is not None
    assert validation.status == "PENDING"
    assert validation.next_checkpoint == "H24"
    assert validation.next_checkpoint_at == NOW + timedelta(hours=24)
    assert validation.last_check_outcome == "NO_INFORMATION"
    assert check is not None and check.outcome == "NO_INFORMATION"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_registration_survives_initial_sisca_execution_failure(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async def unavailable(_validation_id):
        raise RuntimeError("injected SISCA outage")

    service = _service(
        postgres_session_factory,
        initial_validation_check=unavailable,
    )
    registration = await service.register(_command())
    result = await service.run_initial_validation(registration)

    async with postgres_session_factory() as session:
        customer = await session.get(CustomerModel, result.customer.id)
        validation = await session.get(SiscaValidationModel, result.validation_id)

    assert result.validation_status == "PENDING"
    assert customer is not None and customer.customer_status == "PENDING_VALIDATION"
    assert validation is not None
    assert validation.status == "PENDING"
    assert validation.next_checkpoint == "H24"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_registration_rolls_back_if_validation_creation_fails(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    def fail_validation(customer_id, registered_at):
        raise RuntimeError("injected validation failure")

    with pytest.raises(RuntimeError, match="injected validation failure"):
        await _service(
            postgres_session_factory,
            validation_factory=fail_validation,
        ).register(_command())

    async with postgres_session_factory() as session:
        counts = [
            await session.scalar(select(func.count()).select_from(model))
            for model in (AuthUserModel, CustomerModel, CustomerConsentModel, SiscaValidationModel)
        ]
    assert counts == [0, 0, 0, 0]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_registration_classifies_duplicate_email_and_curp(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    service = _service(postgres_session_factory)
    await service.register(_command())

    with pytest.raises(DuplicateEmailError):
        await service.register(_command(curp="ZXCV123456HMNLRS11", email="ADA@example.com"))
    with pytest.raises(DuplicateCurpError):
        await service.register(_command(email="other@example.com"))


@pytest.mark.integration
@pytest.mark.asyncio
async def test_registration_retries_a_duplicate_rewards_id(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _service(
        postgres_session_factory,
        rewards_id_generator=SequenceRewardsIdGenerator(["RWD-collision"]),
    ).register(_command())
    retrying_generator = SequenceRewardsIdGenerator(["RWD-collision", "RWD-recovered"])

    result = await _service(
        postgres_session_factory,
        rewards_id_generator=retrying_generator,
    ).register(_command(curp="ZXCV123456HMNLRS11", email="other@example.com"))

    assert result.customer.rewards_id == "RWD-recovered"
    assert retrying_generator.calls == 2


@pytest.mark.integration
@pytest.mark.asyncio
async def test_registration_surfaces_rewards_id_collision_exhaustion_without_partial_writes(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _service(
        postgres_session_factory,
        rewards_id_generator=SequenceRewardsIdGenerator(["RWD-collision"]),
    ).register(_command())
    colliding_generator = SequenceRewardsIdGenerator(["RWD-collision"])

    with pytest.raises(RewardsIdCollisionExhaustedError):
        await _service(
            postgres_session_factory,
            rewards_id_generator=colliding_generator,
        ).register(_command(curp="ZXCV123456HMNLRS11", email="other@example.com"))

    async with postgres_session_factory() as session:
        auth_count = await session.scalar(select(func.count()).select_from(AuthUserModel))
        customer_count = await session.scalar(select(func.count()).select_from(CustomerModel))
    assert colliding_generator.calls == 3
    assert (auth_count, customer_count) == (1, 1)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_registration_rejects_missing_terms_and_password_mismatch_without_writes(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    service = _service(postgres_session_factory)

    with pytest.raises(TermsNotAcceptedError):
        await service.register(_command(terms_accepted=False))
    with pytest.raises(PasswordMismatchError):
        await service.register(_command(confirm_password="different-password"))

    async with postgres_session_factory() as session:
        assert await session.scalar(select(func.count()).select_from(AuthUserModel)) == 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_login_session_profile_validation_status_and_logout(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    service = _service(postgres_session_factory)
    registered = await service.register(_command())

    with pytest.raises(InvalidCredentialsError):
        await service.login(LoginCommand(email="ada@example.com", password="wrong-password"))
    with pytest.raises(InvalidCredentialsError):
        await service.login(LoginCommand(email="missing@example.com", password="wrong-password"))

    login = await service.login(LoginCommand(email=" ADA@EXAMPLE.COM ", password="correct-horse-7"))
    profile = await service.get_current_customer(login.session_token)
    validation = await service.get_validation_status(login.session_token)

    assert profile.id == registered.customer.id
    assert validation.customer_id == profile.id
    assert validation.status == "PENDING"
    async with postgres_session_factory() as session:
        stored_session = await session.scalar(select(AuthSessionModel))
    assert stored_session is not None
    assert stored_session.token_hash != login.session_token

    await service.logout(login.session_token)
    with pytest.raises(UnauthenticatedError):
        await service.get_current_customer(login.session_token)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_customer_updates_preserve_versioned_consent_history(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    registered = await _service(postgres_session_factory).register(_command())

    async with postgres_session_factory() as session:
        customer = await session.get(CustomerModel, registered.customer.id)
        assert customer is not None
        customer.city = "Coyoacan"
        session.add(
            CustomerConsentModel(
                id=uuid4(),
                customer_id=customer.id,
                consent_type="TERMS_AND_CONDITIONS",
                accepted_at=NOW + timedelta(days=1),
                terms_version="2026-08",
                audit_metadata={"source": "terms_refresh"},
                created_at=NOW + timedelta(days=1),
                updated_at=NOW + timedelta(days=1),
            )
        )
        await session.commit()

    async with postgres_session_factory() as session:
        versions = tuple(
            (
                await session.scalars(
                    select(CustomerConsentModel.terms_version).order_by(
                        CustomerConsentModel.terms_version
                    )
                )
            ).all()
        )
        customer = await session.get(CustomerModel, registered.customer.id)
    assert versions == ("2026-07", "2026-08")
    assert customer is not None and customer.city == "Coyoacan"
