## MODIFIED Requirements

### Requirement: The simulated customer intake endpoint must expose an opaque HTTP request identifier for every execution
The system SHALL generate a Rewards-managed opaque `request_id` as a new UUID v4 for every `POST /api/v1/customers/intake` execution before request-body validation occurs. The system SHALL ignore any incoming `X-Request-ID` header completely: it SHALL NOT validate it, reuse it, reflect it, or convert it into operational context. The middleware SHALL be the only component responsible for adding `X-Request-ID`, and every HTTP response produced by that exact method-and-route combination SHALL include the generated `X-Request-ID` header. The response body contracts SHALL remain unchanged, and `request_id` SHALL NOT be added to success or error bodies.

#### Scenario: New approved intake returns request header
- **WHEN** a structurally valid simulated payload creates a new approved intake
- **THEN** the response status is `201`, the existing success body contract is unchanged, and the response includes `X-Request-ID` with a valid UUID

#### Scenario: Replay returns a new HTTP request identifier
- **WHEN** the same idempotent simulated request key is received again after the stored intake already ended successfully
- **THEN** the replay response keeps the same `intake_request_id`, returns its normal `200` semantics, and includes a newly generated `X-Request-ID` with a valid UUID distinct from the previous HTTP execution

#### Scenario: Controlled conflict returns request header
- **WHEN** the simulated intake flow returns a controlled `409` outcome for the endpoint
- **THEN** the response preserves the current error envelope and includes `X-Request-ID` with a valid UUID

#### Scenario: Structural validation failure returns request header without creating intake
- **WHEN** `POST /api/v1/customers/intake` fails structural request validation
- **THEN** the response status is `422`, the generic safe validation body contract is unchanged, the response includes `X-Request-ID` with a valid UUID, and no `intake_request_id` is created

#### Scenario: Controlled internal error returns request header
- **WHEN** the simulated intake flow returns a controlled `500` outcome for the endpoint
- **THEN** the response preserves the current error envelope and includes `X-Request-ID` with a valid UUID

#### Scenario: Unexpected exception still returns the generated request header
- **WHEN** an unexpected exception occurs during `POST /api/v1/customers/intake`
- **THEN** the endpoint returns the existing generic safe `500` body, preserves the already generated `X-Request-ID`, and does not expose traceback or internal details in the response body

#### Scenario: Incoming request header is ignored
- **WHEN** the client sends any `X-Request-ID` header value in a request to `POST /api/v1/customers/intake`
- **THEN** the system ignores that value completely and returns a newly generated UUID v4 in the response header instead of reflecting the incoming header

#### Scenario: Other routes do not inherit the intake request header behavior
- **WHEN** a request targets a route other than `POST /api/v1/customers/intake`
- **THEN** that route does not receive this endpoint-specific `X-Request-ID` response behavior from the intake middleware

### Requirement: The simulated customer intake endpoint must document the request identifier as a response header in OpenAPI
The system SHALL document `X-Request-ID` in the OpenAPI response metadata for `POST /api/v1/customers/intake`. This documentation SHALL describe the header without adding `request_id` to the existing success or error body schemas.

#### Scenario: OpenAPI documents request identifier header without schema drift
- **WHEN** the OpenAPI document is generated for `POST /api/v1/customers/intake`
- **THEN** the operation documents `X-Request-ID` as a response header and preserves the current JSON body schemas unchanged

### Requirement: The simulated customer intake endpoint must emit minimal structured HTTP trace logs without sensitive data
For every `POST /api/v1/customers/intake` execution, the system SHALL emit exactly one structured log event named `customer_intake_http_completed`. The only permitted structured fields SHALL be `event`, `request_id`, `method`, `path`, `status_code`, `duration_ms`, and `intake_request_id` only when the request reached a persisted intake result. The log level SHALL be `INFO` for normal responses, conflicts, validations, and controlled errors, and SHALL be `ERROR` for an unexpected exception. `duration_ms` SHALL be numeric and non-negative. The event SHALL NOT include request body, response body, `original_payload`, complete headers, query string, `detail.message`, `source`, `external_request_id`, CURP, NSS, name, email, phone, postal code, Rewards ID, SQL details, credentials, or traceback in structured fields.

#### Scenario: Successful intake log includes request and intake identifiers only
- **WHEN** a simulated intake request completes with a persisted intake result
- **THEN** the `customer_intake_http_completed` event is emitted once at `INFO` level with `request_id`, `method`, `path`, `status_code`, `duration_ms`, and `intake_request_id`, and excludes payload values and PII

#### Scenario: Validation failure log excludes intake identifier and sensitive data
- **WHEN** a simulated intake request fails with `422` before intake creation
- **THEN** the `customer_intake_http_completed` event is emitted once at `INFO` level with `request_id`, `method`, `path`, `status_code`, and `duration_ms`, omits `intake_request_id`, and excludes payload values and PII

#### Scenario: Curp NSS conflict log includes both identifiers without body changes
- **WHEN** the endpoint returns `409` for `curp_nss_conflict`
- **THEN** the response body remains identical to the existing error contract and the single `customer_intake_http_completed` event includes both `request_id` and `intake_request_id`

#### Scenario: Unexpected exception emits one error event with the same request identifier
- **WHEN** an unexpected exception occurs during `POST /api/v1/customers/intake`
- **THEN** the system emits exactly one `customer_intake_http_completed` event at `ERROR` level with the same `request_id` returned in `X-Request-ID`, a numeric non-negative `duration_ms`, and no traceback or internal details in structured fields
