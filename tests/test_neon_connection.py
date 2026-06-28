import pytest

from carobra_rewards.infrastructure.database.verify_connection import verify_connection


@pytest.mark.integration
@pytest.mark.asyncio
async def test_neon_connection(postgres_database_url: str) -> None:
    assert postgres_database_url
    await verify_connection()
