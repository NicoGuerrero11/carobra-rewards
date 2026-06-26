"""Application service orchestration for simulated customer intake."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

from carobra_rewards.modules.customer_intake.application.commands import (
    ProcessSimulatedCustomerIntakeCommand,
)
from carobra_rewards.modules.customer_intake.application.errors import (
    CurpNssConflict,
    CustomerServiceInconsistency,
    ExternalRequestConflict,
    IntakeMutationFailed,
    RewardsIdCollisionExhausted,
    ServiceNotFound,
    SuccessfulIntakeInconsistency,
)
from carobra_rewards.modules.customer_intake.application.results import (
    SimulatedCustomerIntakeResult,
    SimulatedCustomerIntakeStatus,
)
from carobra_rewards.modules.customer_intake.domain.entities import (
    Customer,
    CustomerIntakeRequest,
    CustomerService,
    CustomerServiceStatus,
    CustomerStatus,
    IntakeProcessingStatus,
    OnboardingStatus,
)
from carobra_rewards.modules.customer_intake.domain.errors import (
    DuplicateCustomerCurpError,
    DuplicateCustomerRewardsIdError,
    DuplicateCustomerServiceError,
    DuplicateExternalRequestError,
    IntakeCustomerReassignmentError,
    IntakeRequestNotFoundError,
)
from carobra_rewards.modules.customer_intake.domain.value_objects import JsonObject
from carobra_rewards.modules.customer_intake.infrastructure.persistence.timestamps import (
    utc_now,
)
from carobra_rewards.modules.customer_intake.ports.rewards_id_generator import (
    RewardsIdGenerator,
)
from carobra_rewards.modules.customer_intake.ports.unit_of_work import CustomerIntakeUnitOfWork

_SERVICE_CODE = "AFORE"
_MAX_REWARDS_ID_ATTEMPTS = 3
_CURP_NSS_CONFLICT_REASON = "curp_nss_conflict"
_REPLAYABLE_STATUSES = {
    IntakeProcessingStatus.APPROVED,
    IntakeProcessingStatus.ALREADY_ACTIVE,
}


class ProcessSimulatedCustomerIntake:
    """Execute the provisional simulated intake flow without HTTP or SQLAlchemy."""

    def __init__(
        self,
        unit_of_work: CustomerIntakeUnitOfWork,
        rewards_id_generator: RewardsIdGenerator,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._rewards_id_generator = rewards_id_generator

    async def __call__(
        self,
        command: ProcessSimulatedCustomerIntakeCommand,
    ) -> SimulatedCustomerIntakeResult:
        result: SimulatedCustomerIntakeResult | None = None
        deferred_error: CurpNssConflict | None = None
        async with self._unit_of_work as uow:
            intake_request = await uow.intake_requests.get_by_source_and_external_request_id(
                command.source,
                command.external_request_id,
            )
            if intake_request is not None:
                result, deferred_error = await self._replay_or_conflict(uow, intake_request)
            else:
                intake_request = await self._create_or_recover_intake(uow, command)
                if intake_request.processing_status in _REPLAYABLE_STATUSES:
                    result, deferred_error = await self._replay_or_conflict(uow, intake_request)
                elif intake_request.processing_status is IntakeProcessingStatus.IDENTITY_CONFLICT:
                    deferred_error = CurpNssConflict(
                        intake_request_id=str(intake_request.id)
                    )
                else:
                    await self._set_processing(uow, intake_request.id)
                    service = await uow.services.get_by_code(_SERVICE_CODE)
                    if service is None:
                        raise ServiceNotFound()

                    existing_customer = await uow.customers.get_by_curp(command.curp)
                    if existing_customer is not None:
                        result, deferred_error = await self._complete_existing_customer(
                            uow,
                            intake_request=intake_request,
                            customer=existing_customer,
                            service_id=service.id,
                            incoming_nss=command.nss,
                            replayed=False,
                        )
                    else:
                        result = await self._create_new_customer_flow(
                            uow,
                            command=command,
                            intake_request=intake_request,
                            service_id=service.id,
                        )

        if deferred_error is not None:
            raise deferred_error

        assert result is not None
        return result

    async def _create_or_recover_intake(
        self,
        uow: CustomerIntakeUnitOfWork,
        command: ProcessSimulatedCustomerIntakeCommand,
    ) -> CustomerIntakeRequest:
        now = utc_now()
        intake_request = CustomerIntakeRequest.create(
            source=command.source,
            external_request_id=command.external_request_id,
            curp=command.curp,
            processing_status=IntakeProcessingStatus.RECEIVED,
            processing_details=None,
            original_payload=deepcopy(command.original_payload),
            customer_id=None,
            received_at=now,
            created_at=now,
            updated_at=now,
        )
        try:
            async with uow.savepoint():
                await uow.intake_requests.save(intake_request)
            return intake_request
        except DuplicateExternalRequestError:
            winner = await uow.intake_requests.get_by_source_and_external_request_id(
                command.source,
                command.external_request_id,
            )
            if winner is None:
                raise IntakeMutationFailed() from None
            return winner

    async def _replay_or_conflict(
        self,
        uow: CustomerIntakeUnitOfWork,
        intake_request: CustomerIntakeRequest,
    ) -> tuple[SimulatedCustomerIntakeResult | None, CurpNssConflict | None]:
        if intake_request.processing_status is IntakeProcessingStatus.IDENTITY_CONFLICT:
            return None, CurpNssConflict(intake_request_id=str(intake_request.id))
        if intake_request.processing_status not in _REPLAYABLE_STATUSES:
            raise ExternalRequestConflict()
        if intake_request.customer_id is None:
            raise SuccessfulIntakeInconsistency()

        customer = await uow.customers.get_by_id(intake_request.customer_id)
        if customer is None or not customer.rewards_id:
            raise SuccessfulIntakeInconsistency()

        return (
            SimulatedCustomerIntakeResult(
                intake_request_id=str(intake_request.id),
                customer_id=str(customer.id),
                rewards_id=customer.rewards_id,
                status=SimulatedCustomerIntakeStatus(intake_request.processing_status.value),
                replayed=True,
            ),
            None,
        )

    async def _set_processing(self, uow: CustomerIntakeUnitOfWork, intake_request_id) -> None:
        try:
            await uow.intake_requests.update_status(
                intake_request_id,
                IntakeProcessingStatus.PROCESSING,
                None,
            )
        except IntakeRequestNotFoundError as exc:
            raise IntakeMutationFailed() from exc

    async def _create_new_customer_flow(
        self,
        uow: CustomerIntakeUnitOfWork,
        command: ProcessSimulatedCustomerIntakeCommand,
        intake_request: CustomerIntakeRequest,
        service_id,
    ) -> SimulatedCustomerIntakeResult:
        duplicate_curp_customer: Customer | None = None
        for _ in range(_MAX_REWARDS_ID_ATTEMPTS):
            now = utc_now()
            customer = Customer.create(
                rewards_id=self._rewards_id_generator.generate(),
                curp=command.curp,
                nss=command.nss,
                name=command.name,
                email=command.email,
                phone=command.phone,
                postal_code=command.postal_code,
                customer_status=CustomerStatus.PENDING_ONBOARDING,
                onboarding_status=OnboardingStatus.PENDING,
                created_at=now,
                updated_at=now,
            )
            relation = CustomerService.create(
                customer_id=customer.id,
                service_id=service_id,
                status=CustomerServiceStatus.ACTIVE,
                started_at=now,
                ended_at=None,
                created_at=now,
                updated_at=now,
            )
            try:
                async with uow.savepoint():
                    await uow.customers.create(customer)
                    await uow.customer_services.create(relation)
                await self._associate_and_finalize(
                    uow,
                    intake_request_id=intake_request.id,
                    customer_id=customer.id,
                    status=IntakeProcessingStatus.APPROVED,
                    processing_details=None,
                    processed_at=now,
                )
                return SimulatedCustomerIntakeResult(
                    intake_request_id=str(intake_request.id),
                    customer_id=str(customer.id),
                    rewards_id=customer.rewards_id,
                    status=SimulatedCustomerIntakeStatus.APPROVED,
                    replayed=False,
                )
            except DuplicateCustomerRewardsIdError:
                continue
            except DuplicateCustomerCurpError:
                duplicate_curp_customer = await uow.customers.get_by_curp(command.curp)
                break
            except DuplicateCustomerServiceError as exc:
                raise IntakeMutationFailed() from exc

        if duplicate_curp_customer is not None:
            result, deferred_error = await self._complete_existing_customer(
                uow,
                intake_request=intake_request,
                customer=duplicate_curp_customer,
                service_id=service_id,
                replayed=False,
                incoming_nss=command.nss,
            )
            if deferred_error is not None:
                raise deferred_error
            assert result is not None
            return result

        raise RewardsIdCollisionExhausted()

    async def _complete_existing_customer(
        self,
        uow: CustomerIntakeUnitOfWork,
        *,
        intake_request: CustomerIntakeRequest,
        customer: Customer,
        service_id,
        replayed: bool,
        incoming_nss: str,
    ) -> tuple[SimulatedCustomerIntakeResult | None, CurpNssConflict | None]:
        relation = await uow.customer_services.get_by_customer_and_service(customer.id, service_id)
        if relation is None or relation.status is not CustomerServiceStatus.ACTIVE:
            raise CustomerServiceInconsistency()

        if customer.nss != incoming_nss:
            await self._associate_and_finalize(
                uow,
                intake_request_id=intake_request.id,
                customer_id=customer.id,
                status=IntakeProcessingStatus.IDENTITY_CONFLICT,
                processing_details={"reason": _CURP_NSS_CONFLICT_REASON},
                processed_at=utc_now(),
            )
            return None, CurpNssConflict(intake_request_id=str(intake_request.id))

        processed_at = datetime.now(UTC)
        await self._associate_and_finalize(
            uow,
            intake_request_id=intake_request.id,
            customer_id=customer.id,
            status=IntakeProcessingStatus.ALREADY_ACTIVE,
            processing_details=None,
            processed_at=processed_at,
        )
        return (
            SimulatedCustomerIntakeResult(
                intake_request_id=str(intake_request.id),
                customer_id=str(customer.id),
                rewards_id=customer.rewards_id,
                status=SimulatedCustomerIntakeStatus.ALREADY_ACTIVE,
                replayed=replayed,
            ),
            None,
        )

    async def _associate_and_finalize(
        self,
        uow: CustomerIntakeUnitOfWork,
        *,
        intake_request_id,
        customer_id,
        status: IntakeProcessingStatus,
        processing_details: JsonObject | None,
        processed_at: datetime,
    ) -> None:
        try:
            await uow.intake_requests.associate_customer(intake_request_id, customer_id)
            await uow.intake_requests.update_status(
                intake_request_id,
                status,
                processing_details,
                processed_at=processed_at,
            )
        except (IntakeRequestNotFoundError, IntakeCustomerReassignmentError) as exc:
            raise IntakeMutationFailed() from exc
