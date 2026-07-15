from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def normalize_async_database_url(value: str) -> str:
    normalized = value.strip()
    if normalized.startswith("postgres://"):
        normalized = "postgresql+asyncpg://" + normalized.removeprefix("postgres://")
    elif normalized.startswith("postgresql://"):
        normalized = "postgresql+asyncpg://" + normalized.removeprefix("postgresql://")
    elif not normalized.startswith("postgresql+asyncpg://"):
        raise ValueError("Database URL must use a PostgreSQL scheme")

    parts = urlsplit(normalized)
    query: list[tuple[str, str]] = []
    for key, query_value in parse_qsl(parts.query, keep_blank_values=True):
        if key == "channel_binding":
            continue
        query.append(("ssl" if key == "sslmode" else key, query_value))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
