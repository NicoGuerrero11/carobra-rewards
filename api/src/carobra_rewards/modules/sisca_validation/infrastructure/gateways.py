from __future__ import annotations

import logging
from datetime import date
from time import monotonic
from typing import Literal

import httpx

from carobra_rewards.modules.sisca_validation.domain.models import (
    FoundSiscaValidation,
    SiscaGatewayResult,
    SiscaNoInformation,
    SiscaTechnicalFailure,
    SiscaValidationRequest,
    TechnicalFailureCategory,
)

logger = logging.getLogger(__name__)


class SimulatedSiscaValidationGateway:
    def __init__(
        self,
        results: dict[str, SiscaGatewayResult] | None = None,
        *,
        default: SiscaGatewayResult | None = None,
    ) -> None:
        self._results = {key.strip().upper(): value for key, value in (results or {}).items()}
        self._default = default or SiscaNoInformation()

    async def query(self, request: SiscaValidationRequest) -> SiscaGatewayResult:
        return self._results.get(request.curp.strip().upper(), self._default)


class HttpSiscaValidationGateway:
    def __init__(
        self,
        *,
        base_url: str,
        validation_path: str,
        timeout_seconds: float,
        api_token: str | None = None,
        auth_mode: Literal["bearer", "api_key"] = "api_key",
        api_key_header: str = "X-API-Key",
        response_format: Literal["canonical", "business_envelope"] = "business_envelope",
        trace_identifier: str | None = None,
        trace_identifier_header: str = "X-Rewards-Id",
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._validation_path = "/" + validation_path.lstrip("/")
        self._timeout_seconds = timeout_seconds
        self._api_token = api_token
        self._auth_mode = auth_mode
        self._api_key_header = api_key_header
        self._response_format = response_format
        self._trace_identifier = trace_identifier
        self._trace_identifier_header = trace_identifier_header
        self._client = client

    async def query(self, request: SiscaValidationRequest) -> SiscaGatewayResult:
        started = monotonic()
        http_status = None
        category = None
        try:
            response = await self._post(request)
            http_status = response.status_code
            result = self._map_response(response)
            if isinstance(result, SiscaTechnicalFailure):
                category = result.category.value
            return result
        except httpx.TimeoutException:
            category = TechnicalFailureCategory.TIMEOUT.value
            return SiscaTechnicalFailure(
                category=TechnicalFailureCategory.TIMEOUT,
                retryable=True,
            )
        except httpx.RequestError:
            category = TechnicalFailureCategory.CONNECTION.value
            return SiscaTechnicalFailure(
                category=TechnicalFailureCategory.CONNECTION,
                retryable=True,
            )
        finally:
            logger.info(
                "sisca_validation_request_completed",
                extra={
                    "event": "sisca_validation_request_completed",
                    "request_id": str(request.request_id),
                    "http_status": http_status,
                    "failure_category": category,
                    "duration_ms": round((monotonic() - started) * 1000, 3),
                },
            )

    async def _post(self, request: SiscaValidationRequest) -> httpx.Response:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Request-Id": str(request.request_id),
            "X-Requested-At": request.requested_at.isoformat(),
        }
        if self._api_token is not None:
            if self._auth_mode == "bearer":
                headers["Authorization"] = f"Bearer {self._api_token}"
            else:
                headers[self._api_key_header] = self._api_token
        if self._trace_identifier is not None:
            headers[self._trace_identifier_header] = self._trace_identifier
        if self._client is not None:
            return await self._client.post(
                self._validation_path,
                json={"curp": request.curp},
                headers=headers,
                timeout=self._timeout_seconds,
            )
        async with httpx.AsyncClient(base_url=self._base_url) as client:
            return await client.post(
                self._validation_path,
                json={"curp": request.curp},
                headers=headers,
                timeout=self._timeout_seconds,
            )

    def _map_response(self, response: httpx.Response) -> SiscaGatewayResult:
        status = response.status_code
        if status in {401, 403}:
            return SiscaTechnicalFailure(
                category=TechnicalFailureCategory.AUTHENTICATION,
                retryable=False,
                http_status=status,
            )
        if status == 429:
            return SiscaTechnicalFailure(
                category=TechnicalFailureCategory.RATE_LIMIT,
                retryable=True,
                http_status=status,
            )
        if status >= 500:
            return SiscaTechnicalFailure(
                category=TechnicalFailureCategory.SERVER,
                retryable=True,
                http_status=status,
            )
        if status != 200:
            return _malformed(status)
        try:
            payload = response.json()
        except ValueError:
            return _malformed(status)
        if self._response_format == "business_envelope":
            return _map_business_envelope(payload, status)
        return _map_canonical_payload(payload, status)


def _map_canonical_payload(payload: object, status: int) -> SiscaGatewayResult:
    if not isinstance(payload, dict) or type(payload.get("found")) is not bool:
        return _malformed(status)
    if payload["found"] is False:
        if set(payload) == {"found"}:
            return SiscaNoInformation(http_status=status)
        return _malformed(status)
    expected = {"found", "tipo_movimiento", "estatus_sf", "fecha_traspaso"}
    if set(payload) != expected:
        return _malformed(status)
    movement = payload["tipo_movimiento"]
    sf_status = payload["estatus_sf"]
    transfer_date = payload["fecha_traspaso"]
    if not all(isinstance(value, str) and value.strip() for value in (movement, sf_status)):
        return _malformed(status)
    if not isinstance(transfer_date, str):
        return _malformed(status)
    try:
        parsed_date = date.fromisoformat(transfer_date)
    except ValueError:
        return _malformed(status)
    return FoundSiscaValidation(
        movement_type=movement,
        sf_status=sf_status,
        transfer_date=parsed_date,
        http_status=status,
    )


def _map_business_envelope(payload: object, status: int) -> SiscaGatewayResult:
    if not isinstance(payload, dict) or set(payload) != {"success", "codigo", "mensaje", "data"}:
        return _malformed(status)
    if payload["success"] is not True or not isinstance(payload["mensaje"], str):
        return _malformed(status)
    code = payload["codigo"]
    if code == "SIN_INFORMACION" and payload["data"] is None:
        return SiscaNoInformation(http_status=status)
    if code != "OK" or not isinstance(payload["data"], dict):
        return _malformed(status)
    data = payload["data"]
    expected = {"tipo_movimiento", "estatus", "fecha_traspaso"}
    if set(data) != expected:
        return _malformed(status)
    movement = data["tipo_movimiento"]
    sf_status = data["estatus"]
    transfer_date = data["fecha_traspaso"]
    if not all(isinstance(value, str) and value.strip() for value in (movement, sf_status)):
        return _malformed(status)
    if not isinstance(transfer_date, str):
        return _malformed(status)
    parsed_date = _parse_transfer_date(transfer_date)
    if parsed_date is None:
        return _malformed(status)
    return FoundSiscaValidation(
        movement_type=movement,
        sf_status=sf_status,
        transfer_date=parsed_date,
        http_status=status,
    )


def _parse_transfer_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except ValueError:
        try:
            return _parse_dmy(value)
        except ValueError:
            return None


def _parse_dmy(value: str) -> date:
    day, month, year = (int(part) for part in value.split("/"))
    return date(year, month, day)


def _malformed(http_status: int | None) -> SiscaTechnicalFailure:
    return SiscaTechnicalFailure(
        category=TechnicalFailureCategory.MALFORMED_RESPONSE,
        retryable=False,
        http_status=http_status,
    )
