from __future__ import annotations

import logging
from datetime import date
from time import monotonic

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
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._validation_path = "/" + validation_path.lstrip("/")
        self._timeout_seconds = timeout_seconds
        self._api_token = api_token
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
            "X-Request-ID": str(request.request_id),
            "X-Requested-At": request.requested_at.isoformat(),
        }
        if self._api_token is not None:
            headers["Authorization"] = f"Bearer {self._api_token}"
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

    @staticmethod
    def _map_response(response: httpx.Response) -> SiscaGatewayResult:
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


def _malformed(http_status: int | None) -> SiscaTechnicalFailure:
    return SiscaTechnicalFailure(
        category=TechnicalFailureCategory.MALFORMED_RESPONSE,
        retryable=False,
        http_status=http_status,
    )
