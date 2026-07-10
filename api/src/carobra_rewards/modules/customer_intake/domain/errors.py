"""Persistence contract errors for customer intake workflows."""


class CustomerIntakeError(Exception):
    """Base type for module-level persistence contract errors."""


class DuplicateExternalRequestError(CustomerIntakeError):
    """Raised when an intake request key already exists."""


class DuplicateCustomerCurpError(CustomerIntakeError):
    """Raised when the normalized CURP already belongs to another customer."""


class DuplicateAuthUserEmailError(CustomerIntakeError):
    """Raised when the normalized email already belongs to an auth user."""


class DuplicateCustomerNssError(CustomerIntakeError):
    """Legacy intake error retained until the provisional SISCA flow is removed."""


class DuplicateCustomerRewardsIdError(CustomerIntakeError):
    """Raised when a generated Rewards ID already exists."""


class DuplicateCustomerConsentError(CustomerIntakeError):
    """Raised when a customer consent version was already recorded."""


class DuplicateCustomerServiceError(CustomerIntakeError):
    """Raised when a customer-service relation already exists."""


class IntakeRequestNotFoundError(CustomerIntakeError):
    """Raised when an expected intake request cannot be found."""


class IntakeCustomerReassignmentError(CustomerIntakeError):
    """Raised when a normal flow attempts to reassign an intake to another customer."""


class UnexpectedPersistenceError(CustomerIntakeError):
    """Raised when infrastructure cannot classify a persistence failure safely."""
