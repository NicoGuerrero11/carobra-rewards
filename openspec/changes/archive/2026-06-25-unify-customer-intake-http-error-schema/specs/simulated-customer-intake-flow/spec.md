## MODIFIED Requirements

### Requirement: The provisional simulated intake payload must be structurally validated exactly
The system SHALL accept a minimum payload containing `source`,
`external_request_id`, `curp`, `nss`, `name`, `email`, optional `phone`, and
optional `postal_code`. The system SHALL accept only `source =
SISCA_SIMULATED`, SHALL reject unknown fields, SHALL validate exact trimming and
length rules compatible with the persistence model, SHALL keep NSS as text, and
SHALL not implement official CURP or NSS validation in this change. When the
request to `POST /api/v1/customers/intake` fails structural validation, that
operation SHALL respond with `422` and a generic safe body shaped as
`{"detail": {"code": "validation_error", "message": "<generic safe message>"}}`.
The `422` response for that operation SHALL NOT include received values, the
original payload, PII, traces, or framework validation details. Other endpoints
SHALL keep their existing FastAPI validation contract in this change.

#### Scenario: Reject invalid source literal
- **WHEN** `source` differs from `SISCA_SIMULATED`, uses a different casing, or contains additional surrounding spaces
- **THEN** the system responds with `422` and the generic `detail.code = validation_error` contract

#### Scenario: Reject empty required strings after trimming
- **WHEN** `external_request_id`, `curp`, `nss`, `name`, or `email` becomes empty after the required `strip` operation
- **THEN** the system responds with `422` and the generic `detail.code = validation_error` contract

#### Scenario: Accept structurally valid simulated payload
- **WHEN** the HTTP request contains all required fields, `source` equals `SISCA_SIMULATED`, and all field lengths fit the agreed limits
- **THEN** the system accepts the payload for application processing

#### Scenario: Reject structurally invalid simulated payload
- **WHEN** the HTTP request is missing a required field, includes an unsupported `source`, includes an unknown field, or violates a structural length limit
- **THEN** the system responds with `422` and a generic safe `detail` error body

#### Scenario: Reject payload with additional fields
- **WHEN** the HTTP request includes a field outside the minimum provisional contract
- **THEN** the system responds with `422` and a generic safe `detail` error body

#### Scenario: Intake validation response excludes framework detail entries
- **WHEN** `POST /api/v1/customers/intake` fails structural request validation
- **THEN** the `422` response body contains only the generic safe `detail.code` and `detail.message` contract and does not expose FastAPI validation detail arrays

### Requirement: The simulated flow must protect sensitive data in responses and generic exposure
The system SHALL persist `original_payload` intact for traceability, but SHALL
not return or broadly expose `original_payload`, `processing_details`, CURP,
NSS, email, phone, or raw database errors in the normal HTTP response for this
flow. The success response SHALL contain only `intake_request_id`,
`customer_id`, `rewards_id`, `status`, and `replayed`. Every endpoint error
body for this flow, including controlled `409`, structural `422`, and
controlled `500`, SHALL use the public shape `{"detail": {"code":
"stable_error_code", "message": "Generic safe message"}}`. Controlled
application failures SHALL keep stable error codes appropriate to the mapped
failure, while structural validation SHALL use `validation_error`. Controlled
runtime failures SHALL continue being raised as `HTTPException(detail={"code":
"...", "message": "..."})`, relying on FastAPI to produce the outer `detail`
wrapper without introducing `detail.detail`.

#### Scenario: Success response excludes sensitive payload data
- **WHEN** the simulated intake flow succeeds
- **THEN** the HTTP response contains only the required identifiers, status, and replay flag

#### Scenario: Controlled error response excludes sensitive and internal persistence details
- **WHEN** the simulated intake flow fails with a controlled application error
- **THEN** the HTTP response uses the public `detail.code` and `detail.message` envelope without payload data, PII, SQL, table names, constraint names, or raw PostgreSQL or SQLAlchemy messages

#### Scenario: Validation error response excludes sensitive and framework details
- **WHEN** the simulated intake flow fails structural request validation
- **THEN** the HTTP response uses `detail.code = validation_error` and a generic safe message without received values, PII, traces, or framework validation details

#### Scenario: Unrelated route keeps standard FastAPI validation contract
- **WHEN** a different endpoint in the same application raises `RequestValidationError`
- **THEN** that endpoint keeps FastAPI's standard validation response format in this change

## ADDED Requirements

### Requirement: The provisional intake endpoint must document one reusable HTTP error envelope
The system SHALL document `POST /api/v1/customers/intake` in OpenAPI with one
reusable response schema for the inner safe error payload and one reusable
response schema for the outer `detail` envelope. The endpoint SHALL advertise
that same public outer error envelope for `409`, `422`, and `500`. That
documentation SHALL apply only to this operation in this change.

#### Scenario: OpenAPI documents the common endpoint error contract
- **WHEN** the OpenAPI schema is generated for `POST /api/v1/customers/intake`
- **THEN** the documented `409`, `422`, and `500` responses all point to the same reusable `detail`-wrapped error schema
