## 1. API Error Contract

- [x] 1.1 Add reusable HTTP schemas for the safe error payload and its `detail` envelope in `src/carobra_rewards/api/v1/customer_intake/schemas.py` without changing the existing request or success schemas.
- [x] 1.2 Update `src/carobra_rewards/api/v1/customer_intake/error_mapping.py` and `src/carobra_rewards/api/v1/customer_intake/router.py` so controlled `409` and `500` keep using `HTTPException(detail={"code": "...", "message": "..."})` at runtime while `409`, `422`, and `500` are documented with the shared outer envelope model only on `POST /api/v1/customers/intake`.
- [x] 1.3 Register a FastAPI `RequestValidationError` translation in the current application setup that matches only `POST /api/v1/customers/intake`, returns `{"detail": {"code": "validation_error", "message": "<generic safe message>"}}` for structural validation failures without exposing validation internals, and delegates every other request to FastAPI's standard handler.

## 2. Focused Contract Tests

- [x] 2.1 Update the direct router structure tests to assert that invalid intake payloads return the exact generic `422` body shape, with no validation detail arrays or received-value leakage.
- [x] 2.2 Add or adjust focused router/OpenAPI tests so `POST /api/v1/customers/intake` documents the same shared outer error envelope for `409`, `422`, and `500`.
- [x] 2.3 Tighten the existing HTTP error assertions to verify the controlled `409` and `500` responses keep the same `detail.code` and `detail.message` envelope without leaking sensitive or internal data.
- [x] 2.4 Add a focused guard test showing an unrelated route still preserves FastAPI's standard `422` validation response format.
