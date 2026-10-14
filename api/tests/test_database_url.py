import ssl

import pytest
from sqlalchemy import event

from carobra_rewards.infrastructure.database.engine import create_database_engine
from carobra_rewards.infrastructure.database.url import normalize_async_database_url


@pytest.mark.parametrize("scheme", ["postgres://", "postgresql://", "postgresql+asyncpg://"])
@pytest.mark.parametrize(
    "query", ["", "?ssl=require", "?sslmode=verify-ca", "?sslmode=verify-full"]
)
def test_urls_always_require_full_verification(scheme: str, query: str) -> None:
    assert normalize_async_database_url(f"{scheme}user:secret@db.example/rewards{query}") == (
        "postgresql+asyncpg://user:secret@db.example/rewards?ssl=verify-full"
    )


def test_required_binding_is_rejected_instead_of_silently_ignored() -> None:
    with pytest.raises(ValueError, match="cannot enforce channel_binding=require"):
        normalize_async_database_url(
            "postgresql://user:secret@db.example/rewards?sslmode=require&channel_binding=require"
        )
    for binding in ["prefer", "disable"]:
        assert normalize_async_database_url(
            f"postgresql://user:secret@db.example/rewards?channel_binding={binding}"
        ).endswith("?ssl=verify-full")


@pytest.mark.parametrize("host", ["127.0.0.1", "[::1]"])
def test_only_explicit_literal_loopback_can_disable_tls(host: str) -> None:
    assert normalize_async_database_url(
        f"postgresql://user:secret@{host}/rewards?sslmode=disable"
    ).endswith("?ssl=disable")


@pytest.mark.parametrize(
    "query",
    [
        "sslmode=disable",
        "ssl=false",
        "ssl=0",
        "sslmode=prefer",
        "sslmode=no-verify",
        "sslmode=",
        "sslmode=require&ssl=disable",
        "ssl=require&ssl=disable",
        "host=127.0.0.1",
        "hostaddr=127.0.0.1",
        "port=5432",
        "dsn=postgres://other/db",
        "sslrootcert=/tmp/ca",
        "sslcert=/tmp/cert",
        "sslkey=/tmp/key",
        "direct_tls=true",
        "SSLMode=disable",
        "%73slmode=disable",
        "channel_binding=unknown",
        "channel_binding=prefer&channel_binding=disable",
        "prepared_statement_cache_size=-1",
    ],
)
def test_rejects_unsafe_modes_and_driver_overrides(query: str) -> None:
    with pytest.raises(ValueError):
        create_database_engine(f"postgresql://user:secret@db.example/rewards?{query}")


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://user:secret@127.0.0.1/db?sslmode=disable&host=remote.example",
        "postgresql://user:secret@localhost/db?sslmode=disable",
        "postgresql://user:secret@/db",
        "postgresql://user:secret@%2ftmp/db",
        "postgresql://user:secret@[]/db",
        "sqlite:///tmp/rewards.db",
    ],
)
def test_rejects_invalid_or_ambiguous_destinations_without_credentials_in_errors(url: str) -> None:
    with pytest.raises(ValueError) as error:
        create_database_engine(url)
    assert "secret" not in str(error.value)


async def test_actual_sqlalchemy_arguments_enforce_context_despite_environment(monkeypatch) -> None:
    monkeypatch.setenv("PGSSLMODE", "disable")
    engine = create_database_engine(
        "postgres://u%40ser:p%3Ass@db.example:5433/rewards?sslmode=require"
    )

    class InspectedError(Exception):
        pass

    @event.listens_for(engine.sync_engine, "do_connect")
    def inspect_connection(_dialect, _record, _args, params):
        assert params["host"] == "db.example"
        assert params["user"] == "u@ser"
        assert params["password"] == "p:ss"
        context = params["ssl"]
        assert isinstance(context, ssl.SSLContext)
        assert context.check_hostname is True
        assert context.verify_mode == ssl.CERT_REQUIRED
        raise InspectedError

    try:
        with pytest.raises(InspectedError):
            await engine.connect()
    finally:
        await engine.dispose()


def test_callers_cannot_override_secure_connect_args() -> None:
    with pytest.raises(TypeError):
        create_database_engine("postgres://user:secret@db.example/db", connect_args={"ssl": False})
