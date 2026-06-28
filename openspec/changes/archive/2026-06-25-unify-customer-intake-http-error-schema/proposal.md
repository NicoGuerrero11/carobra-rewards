## Why

`POST /api/v1/customers/intake` already has a stable request schema and success schema, but its error contract is still inconsistent. Controlled `409` and `500` errors are built differently from FastAPI `422` validation errors, and the current OpenAPI response documentation does not match the actual `detail` wrapper returned by the endpoint.

## What Changes

- Unify only the documented error bodies for `POST /api/v1/customers/intake` so `409`, structural `422`, and controlled `500` return `{"detail": {"code": "...", "message": "..."}}`.
- Keep the existing `CustomerIntakeRequest` and `CustomerIntakeResponse` contracts unchanged.
- Add generic, safe translation for structural `422` validation failures with `code = validation_error`, but only for `POST /api/v1/customers/intake`.
- Keep every other endpoint on the standard FastAPI validation contract by delegating unmatched `RequestValidationError` cases to FastAPI's default handler.
- Document the same outer OpenAPI error envelope for `409`, `422`, and `500` only on this operation, while keeping runtime controlled errors as `HTTPException(detail={"code": "...", "message": "..."})`.
- Add focused router tests for error bodies, lack of validation detail leakage, route-specific `422` behavior, and OpenAPI response schemas.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `simulated-customer-intake-flow`: the provisional intake operation must expose one reusable documented error envelope for controlled conflicts, structural validation failures, and controlled internal failures, without changing validation contracts for other endpoints.

## Impact

- Affected code: `src/carobra_rewards/api/v1/customer_intake/schemas.py`, `src/carobra_rewards/api/v1/customer_intake/router.py`, `src/carobra_rewards/api/v1/customer_intake/error_mapping.py`, and the FastAPI app configuration that registers exception handlers.
- Affected API: `POST /api/v1/customers/intake` error responses and OpenAPI documentation for `409`, `422`, and `500` only; other endpoints keep their current validation contract.
- Affected tests: focused router structure and HTTP contract tests for the intake error body, OpenAPI references, and preservation of the standard FastAPI `422` behavior on an unrelated route.
