"""Functional results returned by the customer intake application layer."""

from dataclasses import dataclass
from enum import StrEnum


class SimulatedCustomerIntakeStatus(StrEnum):
    """Functional outcomes for the SISCA intake flow."""

    ACCEPTED = "accepted"
    NOT_ELIGIBLE = "not_eligible"
    IDEMPOTENT_DUPLICATE = "idempotent_duplicate"


@dataclass(slots=True, frozen=True)
class SimulatedCustomerIntakeResult:
    """Result returned by the use case without HTTP concerns."""

    intake_request_id: str
    customer_id: str | None
    rewards_id: str | None
    status: SimulatedCustomerIntakeStatus
    replayed: bool
