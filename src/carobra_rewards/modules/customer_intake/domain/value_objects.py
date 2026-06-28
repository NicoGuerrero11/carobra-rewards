"""Shared value objects and helpers for the customer intake domain."""

type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]
type JsonObject = dict[str, JsonValue]


def normalize_curp(curp: str) -> str:
    """Apply the closed CURP normalization rule for structured persistence."""
    return curp.strip().upper()
