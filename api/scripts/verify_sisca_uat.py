"""Safely verify the configured outbound SISCA UAT connection.

The probe makes one normal SISCA validation request with a synthetic CURP
provided through ``SISCA_UAT_PROBE_CURP``.  Its output intentionally excludes
the CURP, authorization data, and raw upstream response body.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from uuid import uuid4

from carobra_rewards.core.config import get_settings
from carobra_rewards.modules.sisca_validation.domain.models import (
    FoundSiscaValidation,
    SiscaNoInformation,
    SiscaTechnicalFailure,
    SiscaValidationRequest,
)
from carobra_rewards.modules.sisca_validation.infrastructure.gateways import (
    HttpSiscaValidationGateway,
)


def _build_summary(*, request_id: str, result: object) -> tuple[dict[str, object], int]:
    summary: dict[str, object] = {"request_id": request_id}
    if isinstance(result, FoundSiscaValidation):
        summary.update({"result": "FOUND", "http_status": result.http_status})
        return summary, 0
    if isinstance(result, SiscaNoInformation):
        summary.update({"result": "NO_INFORMATION", "http_status": result.http_status})
        return summary, 0
    if isinstance(result, SiscaTechnicalFailure):
        summary.update(
            {
                "result": "TECHNICAL_FAILURE",
                "http_status": result.http_status,
                "category": result.category.value,
                "retryable": result.retryable,
            }
        )
        return summary, 1
    raise TypeError(f"Unexpected SISCA result type: {type(result)!r}")


async def _run_probe() -> tuple[dict[str, object], int]:
    settings = get_settings()
    curp = os.environ.get("SISCA_UAT_PROBE_CURP", "").strip()
    if settings.sisca_adapter != "http":
        raise ValueError("SISCA_ADAPTER must be 'http' for the UAT connectivity probe")
    if settings.app_env != "uat":
        raise ValueError("APP_ENV must be 'uat' for the UAT connectivity probe")
    settings.validate_sisca_http_configuration()
    if settings.sisca_base_url is None:
        raise ValueError("SISCA_BASE_URL must be configured for the UAT connectivity probe")
    if not curp:
        raise ValueError("SISCA_UAT_PROBE_CURP must contain a synthetic SISCA UAT CURP")

    request_id = uuid4()
    gateway = HttpSiscaValidationGateway(
        base_url=settings.sisca_base_url,
        validation_path=settings.sisca_validation_path,
        timeout_seconds=settings.sisca_timeout_seconds,
        api_token=(
            None
            if settings.active_sisca_api_token is None
            else settings.active_sisca_api_token.get_secret_value()
        ),
        auth_mode=settings.sisca_auth_mode,
        api_key_header=settings.sisca_api_key_header,
        response_format=settings.sisca_response_format,
        trace_identifier=settings.sisca_trace_identifier,
        trace_identifier_header=settings.sisca_trace_identifier_header,
        ca_bundle_path=settings.sisca_ca_bundle_path,
    )
    result = await gateway.query(
        SiscaValidationRequest(
            curp=curp,
            request_id=request_id,
            requested_at=datetime.now(UTC),
        )
    )
    return _build_summary(request_id=str(request_id), result=result)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the outbound SISCA UAT connection")
    parser.parse_args()
    try:
        summary, exit_code = asyncio.run(_run_probe())
    except ValueError as exc:
        print(json.dumps({"result": "CONFIGURATION_ERROR", "message": str(exc)}))
        return 2
    print(json.dumps(summary, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
