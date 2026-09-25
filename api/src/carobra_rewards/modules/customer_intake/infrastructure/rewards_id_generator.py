"""Infrastructure adapter for canonical Rewards ID generation."""

import secrets

MIN_REWARDS_ID = 100_000_000
REWARDS_ID_SPACE = 900_000_000


class NumericRewardsIdGenerator:
    """Generate opaque nine-digit Rewards IDs without customer-derived data."""

    def generate(self) -> str:
        return str(MIN_REWARDS_ID + secrets.randbelow(REWARDS_ID_SPACE))
