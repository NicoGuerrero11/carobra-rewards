from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
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
    _build_tls_context,
)


def _request() -> SiscaValidationRequest:
    return SiscaValidationRequest(
        curp="ABCD123456HMNLRS09",
        request_id=uuid4(),
        requested_at=datetime(2026, 7, 9, tzinfo=UTC),
    )


async def _query(
    handler,
    *,
    auth_mode: Literal["bearer", "api_key"] = "bearer",
    response_format: Literal["canonical", "business_envelope"] = "canonical",
    trace_identifier: str | None = None,
):
    async with httpx.AsyncClient(
        base_url="https://sisca.test",
        transport=httpx.MockTransport(handler),
    ) as client:
        gateway = HttpSiscaValidationGateway(
            base_url="https://sisca.test",
            validation_path="/validations",
            timeout_seconds=1,
            api_token="secret-token",
            auth_mode=auth_mode,
            api_key_header="X-SISCA-API-Key",
            response_format=response_format,
            trace_identifier=trace_identifier,
            trace_identifier_header="X-Rewards-Id",
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
async def test_http_gateway_supports_confirmed_sisca_business_envelope() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-sisca-api-key"] == "secret-token"
        assert request.headers["x-rewards-id"] == "rewards-integration"
        assert "authorization" not in request.headers
        return httpx.Response(
            200,
            json={
                "success": True,
                "codigo": "OK",
                "mensaje": "Consulta realizada correctamente",
                "data": {
                    "tipo_movimiento": "TRASPASO",
                    "estatus": "Certificado",
                    "fecha_traspaso": "24/08/2026",
                },
            },
        )

    result = await _query(
        handler,
        auth_mode="api_key",
        response_format="business_envelope",
        trace_identifier="rewards-integration",
    )

    assert isinstance(result, FoundSiscaValidation)
    assert result.movement_type == "TRASPASO"
    assert result.sf_status == "Certificado"
    assert result.transfer_date.isoformat() == "2026-08-24"


@pytest.mark.asyncio
async def test_http_gateway_maps_sisca_business_no_information() -> None:
    result = await _query(
        lambda _: httpx.Response(
            200,
            json={
                "success": True,
                "codigo": "SIN_INFORMACION",
                "mensaje": "No existe información para la CURP consultada",
                "data": None,
            },
        ),
        auth_mode="api_key",
        response_format="business_envelope",
    )

    assert isinstance(result, SiscaNoInformation)


@pytest.mark.asyncio
async def test_http_gateway_rejects_multiple_sisca_records() -> None:
    result = await _query(
        lambda _: httpx.Response(
            200,
            json={
                "success": True,
                "codigo": "OK",
                "mensaje": "Consulta realizada correctamente",
                "data": [
                    {
                        "tipo_movimiento": "Traspaso NAP",
                        "estatus": "ACEPTADA PROCESAR",
                        "fecha_traspaso": "02/07/2026",
                    }
                ],
            },
        ),
        auth_mode="api_key",
        response_format="business_envelope",
    )

    assert isinstance(result, SiscaTechnicalFailure)
    assert result.category is TechnicalFailureCategory.MALFORMED_RESPONSE


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "category", "retryable"),
    [
        (400, TechnicalFailureCategory.MALFORMED_RESPONSE, False),
        (401, TechnicalFailureCategory.AUTHENTICATION, False),
        (405, TechnicalFailureCategory.MALFORMED_RESPONSE, False),
        (429, TechnicalFailureCategory.RATE_LIMIT, True),
        (500, TechnicalFailureCategory.SERVER, True),
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


def test_tls_context_loads_the_verified_sisca_intermediate() -> None:
    certificate = Path(__file__).parents[3] / "certs" / "RapidSSLTLSRSACAG1.pem"

    context = _build_tls_context(str(certificate))
    common_names = {
        value
        for item in context.get_ca_certs()
        for attribute in item["subject"]
        for key, value in attribute
        if key == "commonName"
    }

    assert "RapidSSL TLS RSA CA G1" in common_names


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
