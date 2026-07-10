from typing import Protocol

from carobra_rewards.modules.sisca_validation.domain.models import (
    SiscaGatewayResult,
    SiscaValidationRequest,
)


class SiscaValidationGateway(Protocol):
    async def query(self, request: SiscaValidationRequest) -> SiscaGatewayResult: ...
