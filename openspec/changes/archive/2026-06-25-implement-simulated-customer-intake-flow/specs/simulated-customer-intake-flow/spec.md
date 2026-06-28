## ADDED Requirements

### Requirement: The system must expose a single provisional HTTP entrypoint for simulated customer intake
The system SHALL expose the provisional simulated intake flow at
`POST /api/v1/customers/intake` and SHALL stop keeping
`POST /api/v1/customers/intake/_preview` active as an alternative intake
processing route once the new endpoint functional provisional backed by real
persistence exists.

#### Scenario: Functional provisional endpoint replaces preview route
- **WHEN** the simulated intake flow is available
- **THEN** the active HTTP entrypoint is `POST /api/v1/customers/intake`

### Requirement: The provisional simulated intake payload must be structurally validated exactly
The system SHALL accept a minimum payload containing `source`,
`external_request_id`, `curp`, `nss`, `name`, `email`, optional `phone`, and
optional `postal_code`. The system SHALL accept only `source =
SISCA_SIMULATED`, SHALL reject unknown fields, SHALL validate exact trimming and
length rules compatible with the persistence model, SHALL keep NSS as text, and
SHALL not implement official CURP or NSS validation in this change.

#### Scenario: Reject invalid source literal
- **WHEN** `source` differs from `SISCA_SIMULATED`, uses a different casing, or contains additional surrounding spaces
- **THEN** the system responds with `422`

#### Scenario: Reject empty required strings after trimming
- **WHEN** `external_request_id`, `curp`, `nss`, `name`, or `email` becomes empty after the required `strip` operation
- **THEN** the system responds with `422`

#### Scenario: Accept structurally valid simulated payload
- **WHEN** the HTTP request contains all required fields, `source` equals `SISCA_SIMULATED`, and all field lengths fit the agreed limits
- **THEN** the system accepts the payload for application processing

#### Scenario: Reject structurally invalid simulated payload
- **WHEN** the HTTP request is missing a required field, includes an unsupported `source`, includes an unknown field, or violates a structural length limit
- **THEN** the system responds with `422`

#### Scenario: Reject payload with additional fields
- **WHEN** the HTTP request includes a field outside the minimum provisional contract
- **THEN** the system responds with `422`

### Requirement: Structural validity implies simulated approval only for this change
Only in this change, the system SHALL allow a structurally valid simulated
payload to be treated as approved in order to exercise the technical flow. This
rule SHALL NOT represent official CURP validation, official NSS validation, real
eligibility, or definitive functional approval, and SHALL NOT be reused
automatically when the real SISCA contract arrives.

#### Scenario: Structurally valid payload enters simulated approval path
- **WHEN** the request is structurally valid under the provisional simulated contract
- **THEN** the application may treat it as approved only for this simulated technical flow

#### Scenario: Simulated approval does not imply real business approval
- **WHEN** the simulated flow marks a structurally valid intake as approved
- **THEN** that outcome is understood as a technical test rule rather than official CURP validation, NSS validation, or real eligibility approval

### Requirement: The simulated intake flow must use an application use case independent from HTTP and SQLAlchemy
The system SHALL implement the flow through an application use case equivalent
to `ProcessSimulatedCustomerIntake`. The use case SHALL receive a plain command
that includes every payload field plus an intact `original_payload` copy, SHALL
return a plain result with `intake_request_id`, `customer_id`, `rewards_id`,
`status`, and `replayed`, and SHALL not depend on FastAPI, SQLAlchemy,
`AsyncSession`, or HTTP schemas.

#### Scenario: Application use case stays transport-agnostic
- **WHEN** the simulated intake use case executes
- **THEN** it runs from plain application types without importing FastAPI or SQLAlchemy

### Requirement: A new simulated intake must create the approved customer atomically
For a new `(source, external_request_id)` and a normalized CURP not yet linked
to a customer, the system SHALL persist the intake, normalize CURP using
`strip + uppercase`, treat the simulated scenario as approved, obtain the
`AFORE` service by code, generate a Rewards ID, create the customer, create the
customer-service relation, associate the intake with the customer, set the
intake state to `APPROVED`, commit the whole operation through one unit of
work, and respond with the Rewards ID. The final states SHALL be:
`customer_intake_requests.processing_status = APPROVED`,
`customers.customer_status = PENDING_ONBOARDING`,
`customers.onboarding_status = PENDING`, and
`customer_services.status = ACTIVE`. The intake SHALL also persist
`processed_at` as a UTC timestamp and `processing_details = NULL`.

#### Scenario: Create approved customer from a new simulated intake
- **WHEN** the system receives a valid simulated payload with a new external key and a CURP that is not yet linked to any customer
- **THEN** it commits one atomic operation and responds `201` with `status = APPROVED` and `replayed = false`

#### Scenario: Persist final successful state with UTC processing timestamp
- **WHEN** a new simulated intake succeeds as a new approved customer
- **THEN** the stored intake ends in `APPROVED` with `processed_at` set in UTC and `processing_details = NULL`

### Requirement: The accepted request payload must be preserved intact before domain normalization
The system SHALL persist `original_payload` from the accepted HTTP request
before domain normalization. `original_payload` SHALL preserve request values as
accepted at the transport boundary, SHALL not be reconstructed from already
normalized command fields, SHALL contain no extra fields because requests with
extras are rejected, and SHALL be stored intact while structured CURP columns
use `strip + uppercase`.

#### Scenario: Preserve raw CURP in original payload while normalizing structured CURP
- **WHEN** the accepted request contains `curp = "  abcd123456hmnlrs09  "`
- **THEN** `original_payload.curp` preserves `"  abcd123456hmnlrs09  "` while the structured CURP value is stored as `ABCD123456HMNLRS09`

### Requirement: The flow must be idempotent by external request key
The system SHALL treat `(source, external_request_id)` as the idempotency key
for the simulated flow. If an existing intake for that key is already
`APPROVED` or `ALREADY_ACTIVE`, is associated with a customer, and has a
recoverable Rewards ID, the system SHALL return the same intake, customer, and
Rewards ID without creating new records and without invoking the Rewards ID
generator again. If the existing intake for that key is in any other state, the
system SHALL fail with an application conflict and SHALL not modify records.
The system SHALL also handle concurrent requests by relying on database
uniqueness as the final defense and by re-reading the winning intake after a
duplicate insert race.

#### Scenario: Replay approved intake idempotently
- **WHEN** the same simulated request key is received again after the stored intake is `APPROVED`
- **THEN** the system responds `200` with the original identifiers and `replayed = true`

#### Scenario: Replay already active intake idempotently
- **WHEN** the same simulated request key is received again after the stored intake is `ALREADY_ACTIVE`
- **THEN** the system responds `200` with the original identifiers and `replayed = true`

#### Scenario: Fail when replay data is inconsistent for a successful intake
- **WHEN** the same simulated request key points to an `APPROVED` or `ALREADY_ACTIVE` intake but the intake, `customer_id`, customer, or Rewards ID cannot be recovered consistently
- **THEN** the system responds `500` with a controlled internal error instead of generating new records or returning `409`

#### Scenario: Reject non-recoverable existing intake state for the same key
- **WHEN** the same simulated request key already exists in a state other than `APPROVED` or `ALREADY_ACTIVE`
- **THEN** the system responds `409` and leaves persistence unchanged

#### Scenario: Resolve concurrent duplicate key race through the stored winner
- **WHEN** two concurrent requests try to create the same `(source, external_request_id)` and one loses the database uniqueness race
- **THEN** the losing flow re-reads the winning intake and returns replay or conflict semantics instead of creating duplicate records

### Requirement: CURP already linked to an AFORE customer must produce ALREADY_ACTIVE without creating duplicates
If the external request key is new but the normalized CURP already belongs to a
customer that already has a relation to the `AFORE` service, the system SHALL
persist the new intake for traceability, associate it with the existing
customer, set the intake state to `ALREADY_ACTIVE`, return the existing Rewards
ID, and SHALL NOT generate another Rewards ID, create another customer, or
create another AFORE relation. The new intake SHALL preserve its own
`intake_request_id`, external key, original payload, reference to the existing
customer, `processed_at` in UTC, and `processing_details = NULL`.

#### Scenario: Reuse existing AFORE customer for a new external request
- **WHEN** a valid simulated payload has a new external request key and a CURP already linked to a customer with an AFORE relation
- **THEN** the system responds `200` with `status = ALREADY_ACTIVE` and `replayed = false`

### Requirement: ALREADY_ACTIVE requires an ACTIVE AFORE relation
If a normalized CURP already belongs to a customer but that customer does not
have an `ACTIVE` relation to the `AFORE` service, the system SHALL treat the
condition as an internal inconsistency, SHALL abort the transaction, and SHALL
NOT silently create, reactivate, or repair the relation in this simulated flow.

#### Scenario: Fail when customer exists without AFORE relation
- **WHEN** a valid simulated payload has a new external request key and a CURP already linked to a customer that has no AFORE relation
- **THEN** the system responds `500` and does not commit partial changes

#### Scenario: Fail when AFORE relation exists but is INACTIVE
- **WHEN** a valid simulated payload has a new external request key and a CURP linked to a customer whose AFORE relation exists with status `INACTIVE`
- **THEN** the system responds `500` and does not commit partial changes

#### Scenario: Fail when AFORE relation exists but is ENDED
- **WHEN** a valid simulated payload has a new external request key and a CURP linked to a customer whose AFORE relation exists with status `ENDED`
- **THEN** the system responds `500` and does not commit partial changes

### Requirement: Rewards ID generation must be explicit, opaque, and retryable only on Rewards ID collision
The system SHALL obtain Rewards IDs through an explicit port
`RewardsIdGenerator.generate() -> str`. The provisional implementation SHALL
generate `RWD-` + `secrets.token_hex(16)`. The repository and ORM SHALL NOT
generate Rewards IDs. If persistence detects a duplicate `customers.rewards_id`,
the application SHALL retry generation for a bounded number of attempts. If the
attempts are exhausted, the flow SHALL fail with a controlled internal error.

#### Scenario: Generate provisional opaque Rewards ID
- **WHEN** the simulated flow creates a new customer
- **THEN** the Rewards ID is produced through the generator port using the provisional `RWD-<hex>` format

#### Scenario: Retry after Rewards ID collision
- **WHEN** a generated Rewards ID collides with an existing `customers.rewards_id`
- **THEN** the application generates a new Rewards ID and retries customer creation up to the configured bounded limit

#### Scenario: Fail after exhausting Rewards ID collision retries
- **WHEN** every bounded retry attempt collides on `customers.rewards_id`
- **THEN** the system responds `500` with a controlled internal error and commits nothing

#### Scenario: Exhaust retries after three total attempts
- **WHEN** the initial Rewards ID attempt and the next two regenerated Rewards IDs all collide
- **THEN** the system fails with `RewardsIdCollisionExhausted` after three total attempts

### Requirement: AFORE must be resolved by service code and missing AFORE must abort the flow
The system SHALL obtain the simulated service through `services.code = AFORE`
and SHALL NOT depend on a fixed service UUID in application logic. If `AFORE`
does not exist, the system SHALL abort the transaction, produce a controlled
application error, and SHALL NOT leave partial persistence.

#### Scenario: Abort when AFORE is missing
- **WHEN** the simulated flow cannot find a service with code `AFORE`
- **THEN** the system responds `500` and rolls back the whole operation

### Requirement: The simulated flow must handle a CURP creation race without creating a second identity
If two requests with different external keys race on the same normalized CURP,
the system SHALL not create a second customer identity. If one request loses the
customer creation race by the concrete CURP uniqueness constraint, it SHALL
re-read the winning customer, obtain `AFORE`, and end as `ALREADY_ACTIVE` only
if the relation is `ACTIVE`; otherwise it SHALL fail with
`CustomerServiceInconsistency`.

#### Scenario: Resolve CURP race to ALREADY_ACTIVE when winner has ACTIVE AFORE relation
- **WHEN** two requests with different external keys race to create the same normalized CURP and the losing request re-reads a customer whose AFORE relation is `ACTIVE`
- **THEN** the losing intake completes as `ALREADY_ACTIVE` without creating a second customer

#### Scenario: Fail CURP race when winner lacks ACTIVE AFORE relation
- **WHEN** two requests with different external keys race to create the same normalized CURP and the losing request re-reads a customer whose AFORE relation is missing, `INACTIVE`, or `ENDED`
- **THEN** the losing intake fails with `CustomerServiceInconsistency`

### Requirement: Any failure before commit must roll back the complete simulated intake operation
Any failure before the outer transaction commits SHALL roll back the complete
simulated intake operation. Savepoints MAY recover only the controlled attempts
for external key insertion and customer creation retries, but any final failure
before commit SHALL prevent partial persistence of a newly created intake,
customer, relation, association, or successful final status.

#### Scenario: Roll back after intermediate write failure
- **WHEN** the simulated flow fails after persisting an intermediate write but before the outer transaction commits
- **THEN** the complete simulated intake operation is rolled back

### Requirement: The simulated flow must protect sensitive data in responses and generic exposure
The system SHALL persist `original_payload` intact for traceability, but SHALL
not return or broadly expose `original_payload`, `processing_details`, CURP,
NSS, email, phone, or raw database errors in the normal HTTP response for this
flow. The success response SHALL contain only `intake_request_id`,
`customer_id`, `rewards_id`, `status`, and `replayed`.

#### Scenario: Success response excludes sensitive payload data
- **WHEN** the simulated intake flow succeeds
- **THEN** the HTTP response contains only the required identifiers, status, and replay flag

#### Scenario: Error response excludes sensitive and internal persistence details
- **WHEN** the simulated intake flow fails with a controlled application error
- **THEN** the HTTP response excludes payload data, PII, SQL, table names, constraint names, and raw PostgreSQL or SQLAlchemy messages

### Requirement: The simulated intake capability must preserve architectural independence
The system SHALL keep HTTP concerns in the API layer, SHALL keep functional
coordination in application, SHALL keep SQLAlchemy in infrastructure, and SHALL
keep the simulated intake use case independent from FastAPI and SQLAlchemy.

#### Scenario: Simulated intake flow preserves architectural boundaries
- **WHEN** the simulated intake capability is implemented
- **THEN** HTTP, application, and infrastructure remain separated according to the current modular boundary
