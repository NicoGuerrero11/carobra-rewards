"""HTTP request tracing for the simulated customer intake endpoint."""

from __future__ import annotations

import logging
from time import perf_counter
from uuid import uuid4

from fastapi import Request
from fastapi.responses import Response

from carobra_rewards.api.v1.customer_intake.error_mapping import (
    CUSTOMER_INTAKE_PATH,
    build_unexpected_error_response,
)

CUSTOMER_INTAKE_REQUEST_ID_HEADER = "X-Request-ID"
CUSTOMER_INTAKE_HTTP_EVENT = "customer_intake_http_completed"

logger = logging.getLogger(__name__)


def is_customer_intake_http_request(request: Request) -> bool:
    """Return whether the request targets the exact intake endpoint."""
    return request.method == "POST" and request.url.path == CUSTOMER_INTAKE_PATH


async def customer_intake_http_tracing_middleware(request: Request, call_next) -> Response:
    """Attach request tracing to the exact customer intake endpoint only."""
    if not is_customer_intake_http_request(request):
        return await call_next(request)

    request_id = str(uuid4())
    request.state.request_id = request_id

    started_at = perf_counter()
    try:
        response = await call_next(request)
        _attach_request_id_header(response, request_id)
        _log_customer_intake_http_event(
            level=logging.INFO,
            request=request,
            request_id=request_id,
            status_code=response.status_code,
            duration_ms=_duration_ms(started_at),
        )
        return response
    except Exception:
        response = build_unexpected_error_response()
        _attach_request_id_header(response, request_id)
        _log_customer_intake_http_event(
            level=logging.ERROR,
            request=request,
            request_id=request_id,
            status_code=response.status_code,
            duration_ms=_duration_ms(started_at),
        )
        return response


def _attach_request_id_header(response: Response, request_id: str) -> None:
    response.headers[CUSTOMER_INTAKE_REQUEST_ID_HEADER] = request_id


def _duration_ms(started_at: float) -> int:
    return max(0, int((perf_counter() - started_at) * 1000))


def _log_customer_intake_http_event(
    *,
    level: int,
    request: Request,
    request_id: str,
    status_code: int,
    duration_ms: int,
) -> None:
    event = {
        "event": CUSTOMER_INTAKE_HTTP_EVENT,
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status_code": status_code,
        "duration_ms": duration_ms,
    }
    intake_request_id = getattr(request.state, "intake_request_id", None)
    if intake_request_id is not None:
        event["intake_request_id"] = intake_request_id
    logger.log(level, CUSTOMER_INTAKE_HTTP_EVENT, extra=event)
