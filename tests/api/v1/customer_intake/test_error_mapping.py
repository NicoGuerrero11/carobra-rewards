from fastapi import status

from carobra_rewards.api.v1.customer_intake.error_mapping import (
    build_unexpected_error_response,
    build_validation_error_response,
    map_result_to_http_status,
)
from carobra_rewards.modules.customer_intake.application.results import (
    SimulatedCustomerIntakeResult,
    SimulatedCustomerIntakeStatus,
)


def test_map_result_to_http_status_uses_201_only_for_new_accepted_intakes() -> None:
    accepted = SimulatedCustomerIntakeResult(
        intake_request_id="intake-1",
        customer_id="customer-1",
        rewards_id="RWD-1",
        status=SimulatedCustomerIntakeStatus.ACCEPTED,
        replayed=False,
    )
    not_eligible = SimulatedCustomerIntakeResult(
        intake_request_id="intake-2",
        customer_id=None,
        rewards_id=None,
        status=SimulatedCustomerIntakeStatus.NOT_ELIGIBLE,
        replayed=False,
    )

    assert map_result_to_http_status(accepted) == status.HTTP_201_CREATED
    assert map_result_to_http_status(not_eligible) == status.HTTP_200_OK


def test_build_validation_error_response_uses_structurally_invalid_contract() -> None:
    response = build_validation_error_response()

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.body == (
        b'{"detail":{"code":"structurally_invalid",'
        b'"message":"The intake payload is structurally invalid."}}'
    )


def test_build_unexpected_error_response_uses_generic_contract() -> None:
    response = build_unexpected_error_response()

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.body == (
        b'{"detail":{"code":"internal_error",'
        b'"message":"The customer intake flow failed unexpectedly."}}'
    )
