## 1. HTTP request identifier plumbing

- [x] 1.1 Add a global HTTP middleware with an exact guard for `POST /api/v1/customers/intake` that generates a new UUID v4 `request_id` before body validation, ignores any incoming `X-Request-ID`, and stores the generated value on `request.state.request_id`
- [x] 1.2 Make the middleware the only writer of `X-Request-ID` so every HTTP response from `POST /api/v1/customers/intake`, including unexpected exceptions, carries the generated header without changing existing JSON bodies
- [x] 1.3 Propagate `request.state.intake_request_id` only when the execution produced or recovered a persisted intake, including `201 APPROVED`, successful replay, `200 ALREADY_ACTIVE`, and `409 curp_nss_conflict`

## 2. Minimal structured logging

- [x] 2.1 Emit exactly one structured event named `customer_intake_http_completed` per `POST /api/v1/customers/intake` execution with only `event`, `request_id`, `method`, `path`, `status_code`, `duration_ms`, and optional `intake_request_id`
- [x] 2.2 Log that event at `INFO` for normal responses, conflicts, validations, and controlled errors, and at `ERROR` for unexpected exceptions while preserving the same `request_id` returned in `X-Request-ID`
- [x] 2.3 Exclude request body, response body, `original_payload`, headers completos, query string, `detail.message`, payload identifiers, PII, Rewards ID, SQL, credentials, and traceback from the structured event fields

## 3. Focused verification

- [x] 3.1 Add HTTP tests proving `201`, `200`, `409`, `422`, and `500` responses from `POST /api/v1/customers/intake` all include a valid UUID in `X-Request-ID`
- [x] 3.2 Add tests proving any incoming `X-Request-ID` header is ignored and the response always returns a newly generated UUID v4
- [x] 3.3 Add tests proving replay returns a new `request_id` while preserving the same `intake_request_id`, and that `422` creates no intake and omits `intake_request_id` from logs
- [x] 3.4 Add tests proving `409 curp_nss_conflict` logs both `request_id` and `intake_request_id` without changing the error body, while `external_request_conflict` is not required to include `intake_request_id`
- [x] 3.5 Add tests proving an unexpected exception preserves `X-Request-ID`, returns the existing generic safe `500`, and emits exactly one `ERROR` event
- [x] 3.6 Add logging tests proving exactly one `customer_intake_http_completed` event per execution, exact allowed fields only, numeric non-negative `duration_ms`, and absence of payload, PII, and prohibited fields
- [x] 3.7 Add OpenAPI tests proving `POST /api/v1/customers/intake` documents `X-Request-ID` as a response header and preserves current JSON body schemas unchanged
- [x] 3.8 Add tests proving a non-intake route neither receives this endpoint-specific `X-Request-ID` header behavior nor emits the `customer_intake_http_completed` event
