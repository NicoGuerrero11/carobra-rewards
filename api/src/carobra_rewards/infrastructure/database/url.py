import ipaddress
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def normalize_async_database_url(value: str) -> str:
    normalized = value.strip()
    if normalized.startswith("postgres://"):
        normalized = "postgresql+asyncpg://" + normalized.removeprefix("postgres://")
    elif normalized.startswith("postgresql://"):
        normalized = "postgresql+asyncpg://" + normalized.removeprefix("postgresql://")
    elif not normalized.startswith("postgresql+asyncpg://"):
        raise ValueError("Database URL must use a PostgreSQL scheme")

    try:
        parts = urlsplit(normalized)
        host = parts.hostname
        # Validate the port now, before either SQLAlchemy or asyncpg parses it.
        _ = parts.port
    except ValueError:
        raise ValueError("Database URL is invalid") from None
    if not host or parts.fragment:
        raise ValueError("Database URL requires an explicit DNS hostname or IP and no fragment")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        if not re.fullmatch(r"[a-zA-Z0-9.-]+", host):
            raise ValueError("Database URL requires an explicit DNS hostname or IP") from None

    pairs = parse_qsl(parts.query, keep_blank_values=True)
    allowed = {"ssl", "sslmode", "channel_binding", "prepared_statement_cache_size"}
    query: dict[str, str] = {}
    for key, query_value in pairs:
        if key not in allowed or key in query:
            raise ValueError("Database URL contains unsupported or duplicate connection parameters")
        query[key] = query_value
    if "ssl" in query and "sslmode" in query:
        raise ValueError("Database URL must specify only one SSL mode")
    mode = query.get("sslmode", query.get("ssl", "verify-full")).strip().lower()
    plaintext = mode in {"disable", "false", "0"}
    if plaintext and host not in {"127.0.0.1", "::1"}:
        raise ValueError("SSL disablement is allowed only for explicit loopback IP connections")
    if not plaintext and mode not in {"require", "verify-full", "verify-ca", "true", "1"}:
        raise ValueError("Database URL contains an unsupported or insecure SSL mode")
    binding = query.get("channel_binding", "prefer").strip().lower()
    if binding == "require":
        raise ValueError(
            "asyncpg cannot enforce channel_binding=require; use verified TLS with "
            "channel_binding=prefer or a client that enforces binding"
        )
    if binding not in {"prefer", "disable"}:
        raise ValueError("Database URL contains an unsupported channel_binding mode")

    # asyncpg has no channel binding support. Optional prefer/disable are consumed;
    # a required binding is rejected above, never silently downgraded.
    result = {"ssl": "disable" if plaintext else "verify-full"}
    if "prepared_statement_cache_size" in query:
        size = query["prepared_statement_cache_size"]
        if not re.fullmatch(r"[0-9]+", size):
            raise ValueError("Database URL contains an invalid statement cache size")
        result["prepared_statement_cache_size"] = size
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(result), ""))
