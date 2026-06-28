"""Infrastructure adapter for provisional Rewards ID generation."""

from __future__ import annotations

import secrets


class TokenHexRewardsIdGenerator:
    """Generate provisional opaque Rewards IDs."""

    def generate(self) -> str:
        return f"RWD-{secrets.token_hex(16)}"
