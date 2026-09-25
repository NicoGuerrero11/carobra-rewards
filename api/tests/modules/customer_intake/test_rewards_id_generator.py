from __future__ import annotations

from carobra_rewards.modules.customer_intake.infrastructure.rewards_id_generator import (
    NumericRewardsIdGenerator,
)


def test_numeric_rewards_id_generator_returns_canonical_opaque_values() -> None:
    generator = NumericRewardsIdGenerator()

    generated = {generator.generate() for _ in range(1_000)}

    assert len(generated) == 1_000
    assert all(len(value) == 9 for value in generated)
    assert all(value.isascii() and value.isdecimal() for value in generated)
    assert all(value[0] != "0" for value in generated)
