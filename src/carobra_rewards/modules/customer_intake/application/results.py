"""Functional results returned by the customer intake application layer."""

from dataclasses import dataclass
from enum import StrEnum


class SimulatedCustomerIntakeStatus(StrEnum):
    """Successful outcomes for the provisional simulated intake flow."""

    APPROVED = "APPROVED"
    ALREADY_ACTIVE = "ALREADY_ACTIVE"


@dataclass(slots=True, frozen=True)
class SimulatedCustomerIntakeResult:
    """Result returned by the use case without HTTP concerns."""

    intake_request_id: str
    customer_id: str
    rewards_id: str
    status: SimulatedCustomerIntakeStatus
    replayed: bool
