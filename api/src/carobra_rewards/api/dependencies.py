"""Shared FastAPI dependencies for the HTTP transport layer."""

from carobra_rewards.core.config import Settings, get_settings


def get_api_settings() -> Settings:
    """Expose application settings to HTTP adapters only."""
    return get_settings()
