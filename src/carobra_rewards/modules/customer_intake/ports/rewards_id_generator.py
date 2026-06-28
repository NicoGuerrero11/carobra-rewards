"""Port for generating opaque Rewards IDs."""

from typing import Protocol


class RewardsIdGenerator(Protocol):
    """Generate opaque Rewards identifiers outside HTTP and persistence layers."""

    def generate(self) -> str: ...
