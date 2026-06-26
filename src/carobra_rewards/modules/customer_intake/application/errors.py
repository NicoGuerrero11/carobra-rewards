"""Application-level errors for the simulated intake flow."""


class ProcessSimulatedCustomerIntakeError(Exception):
    """Base type for controlled application errors."""

    def __init__(self, *, intake_request_id: str | None = None) -> None:
        super().__init__()
        self.intake_request_id = intake_request_id


class ExternalRequestConflictError(ProcessSimulatedCustomerIntakeError):
    """The external request key already exists in a non-replayable state."""


class CurpNssConflictError(ProcessSimulatedCustomerIntakeError):
    """The incoming NSS conflicts with an existing active-AFORE CURP identity."""


class ServiceNotFoundError(ProcessSimulatedCustomerIntakeError):
    """The required service catalog entry does not exist."""


class CustomerServiceInconsistencyError(ProcessSimulatedCustomerIntakeError):
    """Existing customer data cannot be reused safely for this flow."""


class SuccessfulIntakeInconsistencyError(ProcessSimulatedCustomerIntakeError):
    """A successful stored intake cannot be replayed coherently."""


class RewardsIdCollisionExhaustedError(ProcessSimulatedCustomerIntakeError):
    """Rewards ID generation exhausted the bounded retry budget."""


class IntakeMutationFailedError(ProcessSimulatedCustomerIntakeError):
    """A required intake mutation could not be completed consistently."""


ExternalRequestConflict = ExternalRequestConflictError
CurpNssConflict = CurpNssConflictError
ServiceNotFound = ServiceNotFoundError
CustomerServiceInconsistency = CustomerServiceInconsistencyError
SuccessfulIntakeInconsistency = SuccessfulIntakeInconsistencyError
RewardsIdCollisionExhausted = RewardsIdCollisionExhaustedError
IntakeMutationFailed = IntakeMutationFailedError
