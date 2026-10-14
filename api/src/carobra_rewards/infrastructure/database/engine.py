import ssl
from typing import Any

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from carobra_rewards.infrastructure.database.url import normalize_async_database_url


def create_database_engine(value: str, **options: Any) -> AsyncEngine:
    """Build every PostgreSQL engine with the same verified TLS policy."""
    url = make_url(normalize_async_database_url(value))
    context: ssl.SSLContext | bool
    if url.query["ssl"] == "disable":
        context = False
    else:
        context = ssl.create_default_context()
        context.check_hostname = True
        context.verify_mode = ssl.CERT_REQUIRED
    # Remove the string mode before passing the explicit context to asyncpg.
    # A duplicate connect_args in options fails closed instead of overriding it.
    return create_async_engine(
        url.difference_update_query(["ssl"]), connect_args={"ssl": context}, **options
    )
