# SISCA Validation Query Contract

## Purpose

Define the minimal outbound validation contract between Rewards and SISCA.
Rewards sends CURP only as customer business data, and SISCA returns only typed
validation fields needed for Rewards-owned lifecycle decisions.

## Requirements

### Requirement: Rewards must query SISCA with the minimum validation request
Rewards SHALL send SISCA only normalized CURP plus Rewards-generated
non-personal tracing metadata required to correlate the operation. The request
MUST NOT include the customer's name, NSS, email, phone, postal code,
credentials, Rewards ID, points, rewards, redemptions, or onboarding data.

#### Scenario: Send a minimum validation query
- **WHEN** Rewards executes a SISCA validation check
- **THEN** the SISCA gateway receives normalized CURP and generated tracing metadata without any additional customer profile data

#### Scenario: Normalize CURP before the query
- **WHEN** stored CURP contains lowercase characters or surrounding whitespace before reaching the gateway boundary
- **THEN** Rewards sends the value normalized with `strip + uppercase`

### Requirement: Rewards must generate trace metadata for every SISCA request
Rewards SHALL generate a new opaque UUID v4 `request_id` and a timezone-aware
UTC `requested_at` value for every physical SISCA request, including retries.
Rewards SHALL preserve this metadata with the check attempt and MUST NOT accept
an external customer-provided request identifier as trusted tracing metadata.

#### Scenario: Generate distinct tracing for a retry
- **WHEN** Rewards retries a technical failure for the same checkpoint
- **THEN** the retry receives a new `request_id` while remaining associated with the original validation and checkpoint

### Requirement: SISCA must return only validation data for a found match
The canonical found response SHALL identify that information was found and SHALL
contain exactly the validation fields `tipo_movimiento`, `estatus_sf`, and
`fecha_traspaso`. Rewards MUST reject a found response that omits a required
validation field, uses an invalid date representation, or includes an unknown
catalog value as a malformed contract response.

#### Scenario: Accept a complete found response
- **WHEN** SISCA returns `found = true` with all three valid validation fields
- **THEN** Rewards accepts the response for business normalization

#### Scenario: Reject an incomplete found response
- **WHEN** SISCA returns `found = true` without one or more required validation fields
- **THEN** Rewards records a technical contract failure and does not infer a business outcome from the incomplete data

### Requirement: SISCA must represent no information separately from failure
The canonical no-information response SHALL be a successful response with
`found = false` and no validation fields. Rewards SHALL normalize this response
to `NO_INFORMATION`. Rewards MUST NOT interpret transport failures, timeout,
authentication failure, rate limiting, server failure, or malformed response as
no information.

#### Scenario: Receive a successful no-information result
- **WHEN** SISCA successfully returns `found = false`
- **THEN** Rewards records `NO_INFORMATION` for the check

#### Scenario: Keep timeout distinct from no information
- **WHEN** the SISCA request times out
- **THEN** Rewards records `TECHNICAL_FAILURE` and does not record `NO_INFORMATION`

### Requirement: The SISCA adapter must classify technical failures safely
The SISCA adapter SHALL convert connection failures, timeouts, authentication
failures, rate limits, server failures, and malformed responses into stable safe
technical categories. The adapter SHALL identify whether the configured policy
permits retry and MUST NOT expose credentials, raw network exceptions, CURP, or
unbounded response bodies to application errors or logs.

#### Scenario: Classify a retryable server failure
- **WHEN** SISCA returns a configured retryable server error
- **THEN** the gateway returns a safe retryable technical failure category without exposing the raw body

#### Scenario: Classify invalid credentials without leaking them
- **WHEN** SISCA rejects adapter authentication
- **THEN** the gateway returns a non-retryable safe authentication failure category and does not expose credential values

### Requirement: Unknown SISCA values must fail closed as contract errors
Rewards SHALL preserve valid raw SISCA values for audit but SHALL treat unknown
`tipo_movimiento` or `estatus_sf` values as `TECHNICAL_FAILURE`. Unknown values
MUST NOT activate, cancel, or classify a customer as not eligible.

#### Scenario: Receive an unknown SISCA status
- **WHEN** SISCA returns an `estatus_sf` value outside the configured contract
- **THEN** Rewards records a contract-related `TECHNICAL_FAILURE` and leaves business state unchanged until checkpoint rules are applied

### Requirement: SISCA validation traffic must protect sensitive data
Rewards SHALL use encrypted transport for the production SISCA integration,
SHALL retrieve credentials from runtime configuration or a secret provider, and
SHALL exclude CURP, request and response bodies, credentials, and raw exceptions
from normal structured logs. Logs MAY contain opaque request and validation
identifiers, checkpoint, duration, HTTP status, and safe outcome category.

#### Scenario: Emit safe validation telemetry
- **WHEN** a SISCA request completes
- **THEN** structured telemetry contains operational identifiers and outcome metadata without CURP, credentials, or raw payloads

### Requirement: The SISCA gateway must remain independent from lifecycle rules
The gateway SHALL translate transport responses into typed found,
no-information, or technical-failure results. It MUST NOT decide customer
activation, cancellation, attention state, or checkpoint scheduling.

#### Scenario: Adapter returns typed data without changing customer state
- **WHEN** the gateway receives a valid found response
- **THEN** it returns typed validation data and leaves all lifecycle decisions to the application service
