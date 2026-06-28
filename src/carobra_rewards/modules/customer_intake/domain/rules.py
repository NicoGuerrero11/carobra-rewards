"""Domain rule helpers.

Transport validation and functional validation are different concerns. A
Pydantic-valid request is not automatically a functionally approved customer.
"""


def build_pending_definition_reasons() -> tuple[str, ...]:
    """Explain why the current result is intentionally neutral."""
    return (
        "Customer intake business rules are not implemented yet.",
        "Transport validation does not imply functional approval.",
    )
