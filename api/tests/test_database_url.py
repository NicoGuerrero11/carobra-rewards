import pytest

from carobra_rewards.infrastructure.database.url import normalize_async_database_url


@pytest.mark.parametrize("scheme", ["postgres://", "postgresql://"])
def test_plain_postgres_urls_use_the_configured_asyncpg_driver(scheme: str) -> None:
    assert (
        normalize_async_database_url(f"{scheme}user:secret@db.example/rewards?sslmode=require")
        == "postgresql+asyncpg://user:secret@db.example/rewards?ssl=require"
    )


def test_asyncpg_database_url_is_preserved() -> None:
    value = "postgresql+asyncpg://user:secret@db.example/rewards"
    assert normalize_async_database_url(value) == value


def test_neon_channel_binding_hint_is_removed_for_asyncpg() -> None:
    value = "postgresql://user:secret@db.example/rewards?sslmode=require&channel_binding=require"
    assert normalize_async_database_url(value) == (
        "postgresql+asyncpg://user:secret@db.example/rewards?ssl=require"
    )


def test_non_postgres_database_url_is_rejected() -> None:
    with pytest.raises(ValueError, match="PostgreSQL scheme"):
        normalize_async_database_url("sqlite:///tmp/rewards.db")
