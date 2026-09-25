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

### Requirement: UAT connection configuration must be explicit and safe

Rewards SHALL configure each SISCA runtime with an environment-specific
endpoint, authentication secret, timeout, retry policy and response catalog.
The adapter MUST remain in its configured simulated mode until all required
UAT connection values are present, and it MUST report missing configuration
without exposing secret values.

#### Scenario: UAT connection configuration is incomplete

- **WHEN** an operator attempts to enable a real UAT SISCA gateway without a
  required connection value
- **THEN** Rewards keeps the gateway disabled or simulated
- **AND** reports the missing configuration key without its value

### Requirement: The adapter must support the confirmed SISCA business envelope

Rewards SHALL normalize the confirmed SISCA envelope containing `success`,
`codigo`, `mensaje` and `data`. HTTP 200 with `codigo=SIN_INFORMACION` and null
data SHALL map to no information rather than technical failure. `codigo=OK`
SHALL require one object with `tipo_movimiento`, `estatus` and
`fecha_traspaso`; `TRASPASO` with `Certificado` SHALL be a validated match. A
list, unknown catalog value or ambiguous record set MUST fail closed. The UAT
contract uses `POST /afore/ws/ws_datos_por_curp.php`, `X-API-Key`,
`X-Rewards-Id` and `X-Request-Id`.

#### Scenario: SISCA has no information for a test CURP

- **WHEN** SISCA returns HTTP 200, `codigo=SIN_INFORMACION` and null data
- **THEN** Rewards records the ordinary no-information outcome
- **AND** does not classify the response as a connection or server failure

#### Scenario: SISCA returns its confirmed certified transfer

- **WHEN** SISCA returns HTTP 200, `codigo=OK`, `tipo_movimiento=TRASPASO` and
  `estatus=Certificado` with a valid `DD/MM/YYYY` transfer date
- **THEN** Rewards records the ordinary validated-match outcome

#### Scenario: SISCA rejects or throttles a request

- **WHEN** SISCA returns one of the documented HTTP 400, 401, 405, 429 or 500
  error envelopes
- **THEN** Rewards classifies it as a safe technical outcome without persisting
  the response body, API Key or CURP in logs

### Requirement: UAT smoke must prove outbound correlation safely

Rewards SHALL provide an authorized UAT smoke operation that submits one
synthetic CURP through the configured SISCA gateway and reports an opaque
correlation reference, HTTP outcome and normalized safe result. Rewards and
SISCA MUST be able to use that reference to reconcile the same request.

#### Scenario: SISCA receives the smoke request

- **WHEN** Rewards executes the approved UAT smoke case
- **THEN** SISCA receives one request conforming to the canonical contract
- **AND** Rewards records a safe opaque correlation reference and normalized
  outcome
- **AND** neither party needs to place the CURP or authentication secret in the
  shared evidence
