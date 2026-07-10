import asyncio

from sqlalchemy import text

from carobra_rewards.core.config import get_settings
from carobra_rewards.infrastructure.database.session import get_engine


async def verify_connection() -> None:
    settings = get_settings()
    if settings.database_url is None:
        raise RuntimeError(
            "DATABASE_URL is not configured. Define it in the environment or in .env before "
            "running the Neon connectivity check."
        )

    async with get_engine().connect() as connection:
        await connection.execute(text("SELECT 1"))


def main() -> None:
    asyncio.run(verify_connection())
    print("Neon connectivity check passed.")
