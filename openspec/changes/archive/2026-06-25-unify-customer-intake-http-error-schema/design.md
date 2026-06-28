## Context

The provisional intake endpoint already validates request structure through `CustomerIntakeRequest` and already maps controlled application failures into safe `409` and `500` responses. Today, those controlled errors are returned as `HTTPException(detail=...)`, which means the real body is wrapped under `detail`, while the documented response models currently point only to the inner payload. Separately, FastAPI still emits its default `422` validation body, which includes field-level validation details and does not match the controlled error format.

This change is intentionally narrow: it must preserve the existing request and success contracts and only normalize the documented intake endpoint error contract. Other endpoints must keep FastAPI's standard validation behavior in this change.

## Goals / Non-Goals

**Goals:**
- Make `409`, `422`, and `500` responses for `POST /api/v1/customers/intake` share the same HTTP body shape.
- Limit that common contract to the intake operation and preserve the existing validation contract everywhere else.
- Keep error messages generic and safe, without echoing payload values, PII, traces, or internal details.
- Document the shared error envelope in OpenAPI so the published contract matches runtime behavior.
- Add focused tests that lock the body shape and OpenAPI schema for this endpoint, plus one guard that an unrelated route still uses standard FastAPI `422`.

**Non-Goals:**
- Redesign `CustomerIntakeRequest` or `CustomerIntakeResponse`.
- Change application-layer error types, persistence behavior, or the simulated intake workflow.
- Introduce field-level validation details into the public `422` contract.
- Expand the same error handler pattern to unrelated endpoints in this change.

## Decisions

1. Introduce a reusable two-level documentation schema for this endpoint.
The API layer should keep a reusable schema for the inner safe payload (`code`, `message`) and add a second reusable schema for the outer `{detail: ...}` envelope. Runtime controlled errors should continue using `HTTPException(detail={"code": "...", "message": "..."})`, letting FastAPI generate the outer wrapper. The outer model exists so OpenAPI can document the actual body without changing runtime behavior or producing `detail.detail`.

Alternative considered: document only the existing inner payload model. Rejected because it would keep OpenAPI out of sync with the real `detail`-wrapped body.

2. Translate `RequestValidationError` into the same safe envelope only for the intake operation.
The `422` shape does not come from the router or use case; it comes from FastAPI's global validation path. The cleanest implementation point is the FastAPI app factory, where a handler can intercept `RequestValidationError`, check `POST /api/v1/customers/intake`, and return a generic safe payload with `code = validation_error` only for that request.

Alternative considered: handle validation inside the route function. Rejected because FastAPI raises request validation before the route function executes.

3. Delegate every non-intake validation error back to FastAPI's standard handler.
Because the handler lives at application level, it must explicitly preserve existing behavior for all other routes. Requests that do not match `POST /api/v1/customers/intake` should be passed to FastAPI's default validation exception handler so their current response shape remains unchanged.

Alternative considered: use one global generic `422` contract for the whole app. Rejected because this change is scoped to one endpoint and must not silently alter unrelated API contracts.

4. Keep controlled `409` and `500` mapping in `error_mapping.py`, but point route documentation to the shared outer envelope schema.
The current separation is correct: application errors stay mapped in the API layer. The change should preserve that split and keep runtime controlled errors under `HTTPException(detail=...)`, while the router advertises the shared outer schema for documented responses.

Alternative considered: build ad hoc dictionaries in the router or exception handler. Rejected because it would duplicate the public contract and weaken consistency.

5. Document `409`, `422`, and `500` explicitly on the route and verify them through OpenAPI tests.
The router should advertise the same outer envelope schema for every endpoint error status that belongs to this contract. A focused OpenAPI test should assert that the intake operation documents `409`, `422`, and `500` with the shared outer response model, while no broader OpenAPI standardization is introduced in this change.

Alternative considered: rely on FastAPI's default `422` OpenAPI generation. Rejected because the default schema would continue exposing FastAPI validation internals instead of the generic contract required for this endpoint.

## Risks / Trade-offs

- [Risk] Overriding `RequestValidationError` at app level could affect other endpoints created by the same application. -> Mitigation: discriminate strictly by method and path, and delegate every other request to FastAPI's standard validation handler.
- [Risk] OpenAPI schema names could drift if the new wrapper model is not reused consistently. -> Mitigation: document one shared envelope schema in the router responses and assert it in focused OpenAPI tests.
- [Risk] Existing tests may assert only status codes and miss regressions in body shape. -> Mitigation: add exact-body assertions for `422` and stronger schema assertions for documented error responses.

## Migration Plan

This is a backward-compatible tightening of a provisional error contract for one operation. Deploy by shipping the API-layer schema update, the route-discriminated validation exception handler, and the matching OpenAPI/test updates together. If rollback is needed, revert the intake-specific error contract changes as one unit so runtime behavior and OpenAPI remain aligned.

## Open Questions

None. This change does not extend the contract to other endpoints, and any future adoption outside `POST /api/v1/customers/intake` requires a separate change.
