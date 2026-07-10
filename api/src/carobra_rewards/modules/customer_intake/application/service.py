"""Application service orchestration for the SISCA customer intake flow."""

from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime

from carobra_rewards.modules.customer_intake.application.commands import (
    ProcessSimulatedCustomerIntakeCommand,
)
from carobra_rewards.modules.customer_intake.application.errors import (
    CurpNssConflict,
    CustomerServiceInconsistency,
    ExternalRequestConflict,
    IntakeMutationFailed,
    MvpStartDateNotConfigured,
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
    DuplicateCustomerNssError,
    DuplicateCustomerRewardsIdError,
    DuplicateCustomerServiceError,
    DuplicateExternalRequestError,
    IntakeCustomerReassignmentError,
    IntakeRequestNotFoundError,
)
from carobra_rewards.modules.customer_intake.domain.value_objects import (
    JsonObject,
    normalize_curp,
    normalize_nss,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.timestamps import (
    utc_now,
)
from carobra_rewards.modules.customer_intake.ports.rewards_id_generator import (
    RewardsIdGenerator,
)
from carobra_rewards.modules.customer_intake.ports.unit_of_work import CustomerIntakeUnitOfWork

_SERVICE_CODE = "AFORE"
_DEFAULT_SOURCE = "SISCA"
_MAX_REWARDS_ID_ATTEMPTS = 3
_CURP_NSS_CONFLICT_REASON = "curp_nss_conflict"
_ALLOWED_MOVEMENT_TYPES = frozenset({"Traspaso NAP", "Registro NAP"})
_ACCEPTED_SF_STATUS = "ACEPTADA PROCESAR"
_FINAL_REPLAYABLE_STATUSES = {
    IntakeProcessingStatus.ACCEPTED,
    IntakeProcessingStatus.NOT_ELIGIBLE,
    IntakeProcessingStatus.APPROVED,
    IntakeProcessingStatus.ALREADY_ACTIVE,
}


class ProcessSimulatedCustomerIntake:
    """Execute the SISCA intake flow without HTTP or SQLAlchemy concerns."""

    def __init__(
        self,
        unit_of_work: CustomerIntakeUnitOfWork,
        rewards_id_generator: RewardsIdGenerator,
        mvp_start_date: date | None = None,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._rewards_id_generator = rewards_id_generator
        self._mvp_start_date = mvp_start_date

    async def __call__(
        self,
        command: ProcessSimulatedCustomerIntakeCommand,
    ) -> SimulatedCustomerIntakeResult:
        if self._mvp_start_date is None:
            raise MvpStartDateNotConfigured()

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
                if intake_request.processing_status in _FINAL_REPLAYABLE_STATUSES:
                    result, deferred_error = await self._replay_or_conflict(uow, intake_request)
                elif intake_request.processing_status is IntakeProcessingStatus.IDENTITY_CONFLICT:
                    deferred_error = CurpNssConflict(intake_request_id=str(intake_request.id))
                else:
                    await self._set_processing(uow, intake_request.id)
                    service = await uow.services.get_by_code(_SERVICE_CODE)
                    if service is None:
                        raise ServiceNotFound()

                    eligible, reason = self._evaluate_eligibility(command)
                    if not eligible:
                        result = await self._finalize_not_eligible(
                            uow,
                            intake_request=intake_request,
                            reason=reason,
                        )
                    else:
                        existing_customer, conflict_reason = await self._resolve_existing_customer(
                            uow,
                            command=command,
                        )
                        if conflict_reason is not None:
                            await self._associate_and_finalize(
                                uow,
                                intake_request_id=intake_request.id,
                                customer_id=existing_customer.id if existing_customer else None,
                                status=IntakeProcessingStatus.IDENTITY_CONFLICT,
                                processing_details={"reason": conflict_reason},
                                processed_at=utc_now(),
                            )
                            deferred_error = CurpNssConflict(
                                intake_request_id=str(intake_request.id)
                            )
                        elif existing_customer is not None:
                            result = await self._complete_existing_customer(
                                uow,
                                intake_request=intake_request,
                                customer=existing_customer,
                                service_id=service.id,
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

    def _evaluate_eligibility(
        self,
        command: ProcessSimulatedCustomerIntakeCommand,
    ) -> tuple[bool, str]:
        assert self._mvp_start_date is not None
        if command.movement_type not in _ALLOWED_MOVEMENT_TYPES:
            return False, "invalid_movement_type"
        if command.sf_status != _ACCEPTED_SF_STATUS:
            return False, "invalid_sf_status"
        if command.transfer_date < self._mvp_start_date:
            return False, "pre_mvp_transfer_date"
        return True, "accepted"

    async def _resolve_existing_customer(
        self,
        uow: CustomerIntakeUnitOfWork,
        *,
        command: ProcessSimulatedCustomerIntakeCommand,
    ) -> tuple[Customer | None, str | None]:
        customer_by_curp = await uow.customers.get_by_curp(command.curp)
        customer_by_nss = await uow.customers.get_by_nss(command.nss)
        if customer_by_curp is None and customer_by_nss is None:
            return None, None
        if (
            customer_by_curp is not None
            and customer_by_nss is not None
            and customer_by_curp.id != customer_by_nss.id
        ):
            return None, _CURP_NSS_CONFLICT_REASON
        customer = customer_by_curp or customer_by_nss
        assert customer is not None
        if customer.curp != normalize_curp(command.curp):
            return customer, _CURP_NSS_CONFLICT_REASON
        # PostgreSQL customers created after the onboarding persistence migration
        # no longer store NSS. Keep validating it only for legacy/in-memory records
        # that still carry the old value during the provisional intake transition.
        if customer.nss and customer.nss != normalize_nss(command.nss):
            return customer, _CURP_NSS_CONFLICT_REASON
        return customer, None

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
        if intake_request.processing_status not in _FINAL_REPLAYABLE_STATUSES:
            raise ExternalRequestConflict()
        if intake_request.processing_status is IntakeProcessingStatus.NOT_ELIGIBLE:
            return (
                SimulatedCustomerIntakeResult(
                    intake_request_id=str(intake_request.id),
                    customer_id=None,
                    rewards_id=None,
                    status=SimulatedCustomerIntakeStatus.IDEMPOTENT_DUPLICATE,
                    replayed=True,
                ),
                None,
            )
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
                status=SimulatedCustomerIntakeStatus.IDEMPOTENT_DUPLICATE,
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

    async def _finalize_not_eligible(
        self,
        uow: CustomerIntakeUnitOfWork,
        *,
        intake_request: CustomerIntakeRequest,
        reason: str,
    ) -> SimulatedCustomerIntakeResult:
        await self._associate_and_finalize(
            uow,
            intake_request_id=intake_request.id,
            customer_id=None,
            status=IntakeProcessingStatus.NOT_ELIGIBLE,
            processing_details={"reason": reason},
            processed_at=utc_now(),
        )
        return SimulatedCustomerIntakeResult(
            intake_request_id=str(intake_request.id),
            customer_id=None,
            rewards_id=None,
            status=SimulatedCustomerIntakeStatus.NOT_ELIGIBLE,
            replayed=False,
        )

    async def _create_new_customer_flow(
        self,
        uow: CustomerIntakeUnitOfWork,
        command: ProcessSimulatedCustomerIntakeCommand,
        intake_request: CustomerIntakeRequest,
        service_id,
    ) -> SimulatedCustomerIntakeResult:
        for _ in range(_MAX_REWARDS_ID_ATTEMPTS):
            now = utc_now()
            customer = Customer.create(
                rewards_id=self._rewards_id_generator.generate(),
                curp=command.curp,
                nss=command.nss,
                name=self._build_customer_name(command),
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
                    status=IntakeProcessingStatus.ACCEPTED,
                    processing_details=None,
                    processed_at=now,
                )
                return SimulatedCustomerIntakeResult(
                    intake_request_id=str(intake_request.id),
                    customer_id=str(customer.id),
                    rewards_id=customer.rewards_id,
                    status=SimulatedCustomerIntakeStatus.ACCEPTED,
                    replayed=False,
                )
            except DuplicateCustomerRewardsIdError:
                continue
            except (DuplicateCustomerCurpError, DuplicateCustomerNssError):
                existing_customer, conflict_reason = await self._resolve_existing_customer(
                    uow,
                    command=command,
                )
                if conflict_reason is not None:
                    await self._associate_and_finalize(
                        uow,
                        intake_request_id=intake_request.id,
                        customer_id=existing_customer.id if existing_customer else None,
                        status=IntakeProcessingStatus.IDENTITY_CONFLICT,
                        processing_details={"reason": conflict_reason},
                        processed_at=utc_now(),
                    )
                    raise CurpNssConflict(intake_request_id=str(intake_request.id)) from None
                if existing_customer is not None:
                    return await self._complete_existing_customer(
                        uow,
                        intake_request=intake_request,
                        customer=existing_customer,
                        service_id=service_id,
                    )
                raise IntakeMutationFailed() from None
            except DuplicateCustomerServiceError as exc:
                raise IntakeMutationFailed() from exc

        raise RewardsIdCollisionExhausted()

    async def _complete_existing_customer(
        self,
        uow: CustomerIntakeUnitOfWork,
        *,
        intake_request: CustomerIntakeRequest,
        customer: Customer,
        service_id,
    ) -> SimulatedCustomerIntakeResult:
        relation = await uow.customer_services.get_by_customer_and_service(customer.id, service_id)
        if relation is None or relation.status is not CustomerServiceStatus.ACTIVE:
            raise CustomerServiceInconsistency()

        processed_at = utc_now()
        await self._associate_and_finalize(
            uow,
            intake_request_id=intake_request.id,
            customer_id=customer.id,
            status=IntakeProcessingStatus.ACCEPTED,
            processing_details=None,
            processed_at=processed_at,
        )
        return SimulatedCustomerIntakeResult(
            intake_request_id=str(intake_request.id),
            customer_id=str(customer.id),
            rewards_id=customer.rewards_id,
            status=SimulatedCustomerIntakeStatus.ACCEPTED,
            replayed=False,
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
            if customer_id is not None:
                await uow.intake_requests.associate_customer(intake_request_id, customer_id)
            await uow.intake_requests.update_status(
                intake_request_id,
                status,
                processing_details,
                processed_at=processed_at,
            )
        except (
            IntakeRequestNotFoundError,
            IntakeCustomerReassignmentError,
        ) as exc:
            raise IntakeMutationFailed() from exc

    @staticmethod
    def _build_customer_name(command: ProcessSimulatedCustomerIntakeCommand) -> str:
        return " ".join(
            [
                command.first_name,
                command.paternal_last_name,
                command.maternal_last_name,
            ]
        ).strip()
