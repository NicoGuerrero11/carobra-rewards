# Bonda response fixtures

These deterministic fixtures preserve the response shapes documented by Bonda's
Public API. Values, identifiers, dates, and codes are synthetic so automated tests
never depend on production data or credentials.

- `catalog-page.json` covers pagination, HTML content, channels, categories, and an
  allowlisted HTTPS image.
- `code-success.json` covers the structured code result returned when `split=1`.
- `code-limit.json` covers Bonda's HTTP-200 business-error envelope.
