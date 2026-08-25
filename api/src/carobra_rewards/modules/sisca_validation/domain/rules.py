from __future__ import annotations

from datetime import date

from carobra_rewards.modules.sisca_validation.domain.models import (
    FoundSiscaValidation,
    NormalizedCheckResult,
    SiscaGatewayResult,
    SiscaNoInformation,
    SiscaTechnicalFailure,
    TechnicalFailureCategory,
    ValidationCheckOutcome,
)

ACCEPTED_TO_PROCESS = "ACEPTADA PROCESAR"
ACCEPTED_OPERATIONS = "ACEPTADA OPERACIONES"
CANCELLED = "CANCELADA"
CERTIFIED = "CERTIFICADO"
DEFAULT_VALIDATED_STATUSES = frozenset({CERTIFIED, ACCEPTED_TO_PROCESS})
DEFAULT_PENDING_STATUSES = frozenset({ACCEPTED_OPERATIONS})
DEFAULT_CANCELLED_STATUSES = frozenset({CANCELLED})


def normalize_catalog_value(value: str) -> str:
    return " ".join(value.strip().upper().split())


def normalize_gateway_result(
    result: SiscaGatewayResult,
    *,
    known_movement_types: frozenset[str],
    allowed_movement_types: frozenset[str],
    minimum_transfer_date: date | None,
    validated_statuses: frozenset[str] = DEFAULT_VALIDATED_STATUSES,
    pending_statuses: frozenset[str] = DEFAULT_PENDING_STATUSES,
    cancelled_statuses: frozenset[str] = DEFAULT_CANCELLED_STATUSES,
) -> NormalizedCheckResult:
    if isinstance(result, SiscaNoInformation):
        return NormalizedCheckResult(
            outcome=ValidationCheckOutcome.NO_INFORMATION,
            http_status=result.http_status,
        )
    if isinstance(result, SiscaTechnicalFailure):
        return NormalizedCheckResult(
            outcome=ValidationCheckOutcome.TECHNICAL_FAILURE,
            http_status=result.http_status,
            error_category=result.category,
            retryable=result.retryable,
        )

    movement = normalize_catalog_value(result.movement_type)
    sf_status = normalize_catalog_value(result.sf_status)
    normalized_known = frozenset(normalize_catalog_value(value) for value in known_movement_types)
    normalized_allowed = frozenset(
        normalize_catalog_value(value) for value in allowed_movement_types
    )
    normalized_validated = frozenset(normalize_catalog_value(value) for value in validated_statuses)
    normalized_pending = frozenset(normalize_catalog_value(value) for value in pending_statuses)
    normalized_cancelled = frozenset(normalize_catalog_value(value) for value in cancelled_statuses)
    known_statuses = normalized_validated | normalized_pending | normalized_cancelled
    if sf_status not in known_statuses or movement not in normalized_known:
        return _unknown_catalog(result)

    if sf_status in normalized_cancelled:
        outcome = ValidationCheckOutcome.MATCH_CANCELLED
    elif sf_status in normalized_pending:
        outcome = ValidationCheckOutcome.MATCH_TEMPORARY_PENDING
    elif movement not in normalized_allowed or (
        minimum_transfer_date is not None and result.transfer_date < minimum_transfer_date
    ):
        outcome = ValidationCheckOutcome.MATCH_NOT_ELIGIBLE
    else:
        outcome = ValidationCheckOutcome.MATCH_VALIDATED

    return NormalizedCheckResult(
        outcome=outcome,
        http_status=result.http_status,
        raw_movement_type=result.movement_type,
        raw_sf_status=result.sf_status,
        raw_transfer_date=result.transfer_date,
    )


def _unknown_catalog(result: FoundSiscaValidation) -> NormalizedCheckResult:
    return NormalizedCheckResult(
        outcome=ValidationCheckOutcome.TECHNICAL_FAILURE,
        http_status=result.http_status,
        raw_movement_type=result.movement_type,
        raw_sf_status=result.sf_status,
        raw_transfer_date=result.transfer_date,
        error_category=TechnicalFailureCategory.UNKNOWN_CATALOG,
        retryable=False,
    )
