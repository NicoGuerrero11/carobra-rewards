from __future__ import annotations

from fastapi import status

from carobra_rewards.api.v1.customer_intake.error_mapping import (
    INTERNAL_ERROR_CODE,
    INTERNAL_ERROR_MESSAGE,
    VALIDATION_ERROR_CODE,
    VALIDATION_ERROR_MESSAGE,
    build_unexpected_error_response,
    build_validation_error_response,
    map_error_to_http_exception,
)
from carobra_rewards.modules.customer_intake.application.errors import (
    CurpNssConflict,
    ExternalRequestConflict,
    ServiceNotFound,
)


def test_map_error_to_http_exception_keeps_inner_payload_only_for_409() -> None:
    response = map_error_to_http_exception(ExternalRequestConflict())

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.detail == {
        "code": "external_request_conflict",
        "message": "The external request is already being processed in an incompatible state.",
    }
    assert "detail" not in response.detail


def test_map_error_to_http_exception_maps_curp_nss_conflict_without_nested_detail() -> None:
    response = map_error_to_http_exception(CurpNssConflict())

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.detail == {
        "code": "curp_nss_conflict",
        "message": "The simulated intake flow could not reuse the existing customer safely.",
    }
    assert "detail" not in response.detail


def test_map_error_to_http_exception_keeps_inner_payload_only_for_500() -> None:
    response = map_error_to_http_exception(ServiceNotFound())

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.detail == {
        "code": "service_not_found",
        "message": "The simulated intake flow is temporarily unavailable.",
    }
    assert "detail" not in response.detail


def test_build_validation_error_response_uses_documented_outer_envelope() -> None:
    response = build_validation_error_response()

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.body == (
        b'{"detail":{"code":"%b","message":"%b"}}'
        % (VALIDATION_ERROR_CODE.encode(), VALIDATION_ERROR_MESSAGE.encode())
    )


def test_build_unexpected_error_response_uses_documented_outer_envelope() -> None:
    response = build_unexpected_error_response()

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.body == (
        b'{"detail":{"code":"%b","message":"%b"}}'
        % (INTERNAL_ERROR_CODE.encode(), INTERNAL_ERROR_MESSAGE.encode())
    )
