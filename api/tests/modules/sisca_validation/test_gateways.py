from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest

from carobra_rewards.modules.sisca_validation.domain.models import (
    FoundSiscaValidation,
    SiscaNoInformation,
    SiscaTechnicalFailure,
    SiscaValidationRequest,
    TechnicalFailureCategory,
)
from carobra_rewards.modules.sisca_validation.infrastructure.gateways import (
    HttpSiscaValidationGateway,
)


def _request() -> SiscaValidationRequest:
    return SiscaValidationRequest(
        curp="ABCD123456HMNLRS09",
        request_id=uuid4(),
        requested_at=datetime(2026, 7, 9, tzinfo=UTC),
    )


async def _query(handler):
    async with httpx.AsyncClient(
        base_url="https://sisca.test",
        transport=httpx.MockTransport(handler),
    ) as client:
        gateway = HttpSiscaValidationGateway(
            base_url="https://sisca.test",
            validation_path="/validations",
            timeout_seconds=1,
            api_token="secret-token",
            client=client,
        )
        return await gateway.query(_request())


@pytest.mark.asyncio
async def test_http_gateway_sends_only_curp_as_business_data() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.content == b'{"curp":"ABCD123456HMNLRS09"}'
        assert request.headers["x-request-id"]
        assert request.headers["x-requested-at"]
        assert request.headers["authorization"] == "Bearer secret-token"
        return httpx.Response(
            200,
            json={
                "found": True,
                "tipo_movimiento": "Traspaso NAP",
                "estatus_sf": "ACEPTADA PROCESAR",
                "fecha_traspaso": "2026-07-02",
            },
        )

    result = await _query(handler)

    assert isinstance(result, FoundSiscaValidation)


@pytest.mark.asyncio
async def test_http_gateway_telemetry_excludes_curp_token_and_raw_body(caplog) -> None:
    caplog.set_level("INFO")
    await _query(lambda _: httpx.Response(503, text="raw-sensitive-body"))

    records = [
        record
        for record in caplog.records
        if getattr(record, "event", None) == "sisca_validation_request_completed"
    ]
    assert len(records) == 1
    rendered = repr(records[0].__dict__)
    assert "ABCD123456HMNLRS09" not in rendered
    assert "secret-token" not in rendered
    assert "raw-sensitive-body" not in rendered


@pytest.mark.asyncio
async def test_http_gateway_keeps_no_information_distinct() -> None:
    result = await _query(lambda _: httpx.Response(200, json={"found": False}))

    assert isinstance(result, SiscaNoInformation)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "category", "retryable"),
    [
        (401, TechnicalFailureCategory.AUTHENTICATION, False),
        (429, TechnicalFailureCategory.RATE_LIMIT, True),
        (503, TechnicalFailureCategory.SERVER, True),
    ],
)
async def test_http_gateway_classifies_status_failures(status, category, retryable) -> None:
    result = await _query(lambda _: httpx.Response(status, text="sensitive body"))

    assert isinstance(result, SiscaTechnicalFailure)
    assert result.category is category
    assert result.retryable is retryable


@pytest.mark.asyncio
async def test_http_gateway_classifies_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("do not expose", request=request)

    result = await _query(handler)

    assert isinstance(result, SiscaTechnicalFailure)
    assert result.category is TechnicalFailureCategory.TIMEOUT


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"found": True, "estatus_sf": "ACEPTADA PROCESAR"},
        {"found": False, "extra": "not allowed"},
        {
            "found": True,
            "tipo_movimiento": "Traspaso NAP",
            "estatus_sf": "X",
            "fecha_traspaso": "not-date",
        },
    ],
)
async def test_http_gateway_rejects_malformed_contract(payload) -> None:
    result = await _query(lambda _: httpx.Response(200, json=payload))

    assert isinstance(result, SiscaTechnicalFailure)
    assert result.category is TechnicalFailureCategory.MALFORMED_RESPONSE
