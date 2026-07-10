"""Application commands for the SISCA customer intake flow."""

from dataclasses import dataclass
from datetime import date

from carobra_rewards.modules.customer_intake.domain.value_objects import JsonObject


@dataclass(slots=True, frozen=True)
class ProcessSimulatedCustomerIntakeCommand:
    """Plain application command for the SISCA intake flow."""

    source: str
    external_request_id: str
    curp: str
    nss: str
    first_name: str
    paternal_last_name: str
    maternal_last_name: str
    email: str
    birth_date: date
    advisor_identifier: str
    movement_type: str
    sf_status: str
    transfer_date: date
    phone: str | None
    postal_code: str | None
    state: str | None
    city: str | None
    original_payload: JsonObject
