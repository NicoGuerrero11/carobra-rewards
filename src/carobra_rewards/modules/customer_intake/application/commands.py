"""Application commands for the simulated customer intake flow."""

from dataclasses import dataclass

from carobra_rewards.modules.customer_intake.domain.value_objects import JsonObject


@dataclass(slots=True, frozen=True)
class ProcessSimulatedCustomerIntakeCommand:
    """Plain application command for the provisional simulated intake flow.

    Structural validity implies simulated approval only for this change. The
    rule is intentionally provisional and must not be promoted automatically to
    the real SISCA contract.
    """

    source: str
    external_request_id: str
    curp: str
    nss: str
    name: str
    email: str
    phone: str | None
    postal_code: str | None
    original_payload: JsonObject
