## ADDED Requirements

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

Rewards SHALL normalize the preliminary SISCA envelope containing `success`,
`codigo`, `mensaje` and `data`. HTTP 200 with `codigo=SIN_INFORMACION` and null
data SHALL map to no information rather than technical failure. `codigo=OK`
SHALL require one object with movement, status and transfer date. A list or
ambiguous record set MUST fail closed until SISCA returns one deterministic
latest record.

#### Scenario: SISCA has no information for a test CURP

- **WHEN** SISCA returns HTTP 200, `codigo=SIN_INFORMACION` and null data
- **THEN** Rewards records the ordinary no-information outcome
- **AND** does not classify the response as a connection or server failure

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
