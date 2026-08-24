from __future__ import annotations

from datetime import date

from carobra_rewards.modules.sisca_validation.domain.models import (
    FoundSiscaValidation,
    SiscaNoInformation,
    SiscaTechnicalFailure,
    TechnicalFailureCategory,
)
from scripts.verify_sisca_uat import _build_summary


def test_probe_summary_is_safe_for_a_found_result() -> None:
    summary, exit_code = _build_summary(
        request_id="request-1",
        result=FoundSiscaValidation(
            movement_type="Traspaso NAP",
            sf_status="ACEPTADA PROCESAR",
            transfer_date=date(2026, 7, 4),  # The probe must not print upstream validation data.
            http_status=200,
        ),
    )

    assert exit_code == 0
    assert summary == {"request_id": "request-1", "result": "FOUND", "http_status": 200}


def test_probe_summary_accepts_a_contractually_valid_no_information_response() -> None:
    summary, exit_code = _build_summary(
        request_id="request-2",
        result=SiscaNoInformation(http_status=200),
    )

    assert exit_code == 0
    assert summary == {
        "request_id": "request-2",
        "result": "NO_INFORMATION",
        "http_status": 200,
    }


def test_probe_summary_reports_a_safe_technical_failure() -> None:
    summary, exit_code = _build_summary(
        request_id="request-3",
        result=SiscaTechnicalFailure(
            category=TechnicalFailureCategory.TIMEOUT,
            retryable=True,
        ),
    )

    assert exit_code == 1
    assert summary == {
        "request_id": "request-3",
        "result": "TECHNICAL_FAILURE",
        "http_status": None,
        "category": "TIMEOUT",
        "retryable": True,
    }
