# SISCA Validation Lifecycle

## Purpose

Define the Rewards-owned lifecycle for creating, scheduling, executing, and
resolving SISCA validation cases after customer registration.

## Requirements

### Requirement: Completed Rewards registration must create a pending validation
When Rewards completes customer registration, the system SHALL create the
customer and exactly one pending SISCA validation case in the same transaction.
The case SHALL reference the customer and use the registration completion time
as `registered_at`. SISCA SHALL NOT create the customer identity.

#### Scenario: Create customer and validation atomically
- **WHEN** a new customer completes valid Rewards registration
- **THEN** Rewards commits the customer in `PENDING_VALIDATION` and a linked validation in `PENDING` together

#### Scenario: Roll back incomplete registration persistence
- **WHEN** validation-case creation fails after the customer insert begins
- **THEN** Rewards rolls back both records and does not leave a customer without its initial validation

### Requirement: Validation checkpoints must use exact elapsed hours
The system SHALL schedule `H24`, `D3`, and `D5` checkpoints at exactly 24, 72,
and 120 elapsed hours after `registered_at`, respectively. Calculations SHALL
use timezone-aware UTC instants and MUST NOT use calendar-day or business-day
rules.

#### Scenario: Calculate all checkpoints from registration
- **WHEN** Rewards creates a pending validation at `registered_at`
- **THEN** the due instants equal `registered_at + 24h`, `registered_at + 72h`, and `registered_at + 120h`

#### Scenario: Keep checkpoint timing independent of weekends
- **WHEN** a checkpoint interval crosses a weekend or holiday
- **THEN** its due instant remains based on elapsed hours without calendar adjustment

### Requirement: Scheduled checks must be idempotent and concurrency-safe
The system SHALL allow at most one completed business execution for each
validation and scheduled checkpoint. Concurrent or repeated delivery of the
same checkpoint SHALL reuse the recorded execution outcome and MUST NOT make a
second state transition. Every physical retry SHALL retain its own attempt
record and request ID.

#### Scenario: Deliver a checkpoint twice
- **WHEN** two workers attempt the same due checkpoint concurrently
- **THEN** only one worker executes the checkpoint business decision and the other observes the persisted result

#### Scenario: Record each physical retry
- **WHEN** a technical failure is retried within the same checkpoint
- **THEN** Rewards stores a distinct attempt with an incremented attempt number and new request ID

### Requirement: Each SISCA check must preserve typed audit history
The system SHALL persist the check type, originating checkpoint, attempt number,
request ID, start and completion times, available HTTP status, normalized
outcome, valid raw SISCA validation fields, and safe error category. The history
MUST NOT duplicate CURP in generic payload JSON or store credentials and raw
exceptions.

#### Scenario: Store a successful validation check
- **WHEN** SISCA returns valid found data
- **THEN** Rewards stores the normalized outcome and the three raw validation values with opaque tracing and timestamps

#### Scenario: Store a safe technical failure
- **WHEN** a SISCA request fails technically
- **THEN** Rewards stores a safe error category without credentials, CURP, or raw exception text

### Requirement: Rewards must normalize SISCA responses into check outcomes
The system SHALL map valid SISCA results to Rewards-owned outcomes:
`ACEPTADA PROCESAR` with allowed movement and transfer date to
`MATCH_VALIDATED`; `ACEPTADA OPERACIONES` to `MATCH_TEMPORARY_PENDING`;
`CANCELADA` to `MATCH_CANCELLED`; `ACEPTADA PROCESAR` that fails configured
movement or transfer-date rules to `MATCH_NOT_ELIGIBLE`; successful absence to
`NO_INFORMATION`; and transport or contract failure to `TECHNICAL_FAILURE`.

#### Scenario: Normalize an eligible accepted operation
- **WHEN** SISCA returns `ACEPTADA PROCESAR` with an allowed movement and transfer date
- **THEN** Rewards records `MATCH_VALIDATED`

#### Scenario: Normalize an operation still in progress
- **WHEN** SISCA returns `ACEPTADA OPERACIONES`
- **THEN** Rewards records `MATCH_TEMPORARY_PENDING`

#### Scenario: Normalize a found but ineligible operation
- **WHEN** SISCA returns `ACEPTADA PROCESAR` with a disallowed movement or transfer date
- **THEN** Rewards records `MATCH_NOT_ELIGIBLE`

### Requirement: Early checkpoints must preserve pending cases when evidence is inconclusive
The system SHALL leave the validation in `PENDING` and the customer in
`PENDING_VALIDATION` when `H24` or `D3` produces
`MATCH_TEMPORARY_PENDING`, `NO_INFORMATION`, or `TECHNICAL_FAILURE`. A
technical failure MAY cause bounded retries according to configuration but MUST
NOT be converted to a business absence or consume a later checkpoint.

#### Scenario: No information at 24 hours remains pending
- **WHEN** the `H24` check returns `NO_INFORMATION`
- **THEN** the validation remains `PENDING` and its next scheduled checkpoint is `D3`

#### Scenario: Technical failure at 72 hours remains pending
- **WHEN** the `D3` check ends in `TECHNICAL_FAILURE` after configured retries
- **THEN** the validation remains `PENDING` and retains the `D5` checkpoint

### Requirement: A validated match must activate the registered customer and V2 journey
At any valid checkpoint, `MATCH_VALIDATED` SHALL atomically change the
validation to `VALIDATED`, record `validated_at`, clear future scheduled work,
change the customer from `PENDING_VALIDATION` to `ACTIVE`, synchronize the
corresponding V2 product evidence, and recalculate the V2 level and redemption
eligibility. This behavior MUST NOT depend on an optional Rewards V2 flag.

#### Scenario: Validate at the first checkpoint
- **WHEN** the `H24` check produces `MATCH_VALIDATED`
- **THEN** Rewards marks the validation `VALIDATED`, activates the customer and
  V2 product journey, recalculates level and eligibility, and schedules no
  later checks

#### Scenario: Replay validated evidence
- **WHEN** the same validated SISCA evidence is synchronized again
- **THEN** Rewards preserves one product projection and does not duplicate V2
  awards

### Requirement: Terminal negative SISCA evidence must preserve the invited Rewards journey
At any checkpoint, `MATCH_CANCELLED` or `MATCH_NOT_ELIGIBLE` SHALL atomically
change the validation to `CANCELLED`, record `cancelled_at`, clear future
scheduled work, preserve the registered customer's V2 journey as `INVITED`, and
keep redemption and validated-product capabilities unavailable. The system MAY
retain an internal non-active customer or product-evidence status for operations,
but MUST NOT present that status as an inactive or blocked Rewards membership.
The final case SHALL record that team notification is required.

#### Scenario: SISCA reports cancellation
- **WHEN** any checkpoint produces `MATCH_CANCELLED`
- **THEN** Rewards cancels the validation, preserves the invited V2 journey and registration award, keeps validated-product actions unavailable, and schedules no later checks

#### Scenario: Operation is not eligible
- **WHEN** any scheduled or initial check produces `MATCH_NOT_ELIGIBLE`
- **THEN** Rewards records the ineligible evidence for operations while the customer-facing V2 journey remains invited without falling back to V1

#### Scenario: Existing terminal-negative customer returns to the site
- **WHEN** a registered customer has a `CANCELLED` validation and no validated active product
- **THEN** the authenticated Rewards projection returns `INVITED` and does not describe the Rewards membership as inactive or blocked

### Requirement: The final checkpoint must resolve business absence and uncertainty explicitly
At `D5`, `NO_INFORMATION` SHALL cancel the validation and make the customer
inactive. `MATCH_TEMPORARY_PENDING` SHALL change the validation to
`REQUIRES_ATTENTION` and keep the customer non-active. `TECHNICAL_FAILURE`
SHALL also change the validation to `REQUIRES_ATTENTION` and MUST NOT
auto-cancel the customer. All three outcomes SHALL record that team notification
is required.

#### Scenario: No information after 120 hours cancels the case
- **WHEN** the `D5` check produces `NO_INFORMATION`
- **THEN** Rewards marks the validation `CANCELLED`, makes the customer inactive, and requires team notification

#### Scenario: Temporary SISCA status after 120 hours needs attention
- **WHEN** the `D5` check produces `MATCH_TEMPORARY_PENDING`
- **THEN** Rewards marks the validation `REQUIRES_ATTENTION` and keeps the customer non-active

#### Scenario: Final technical failure does not auto-cancel
- **WHEN** the `D5` check produces `TECHNICAL_FAILURE` after configured retries
- **THEN** Rewards marks the validation `REQUIRES_ATTENTION` without treating the result as no information

### Requirement: Validation transitions must be atomic and terminal-safe
The system SHALL commit the check attempt, validation transition, customer
transition, and schedule update atomically. Scheduled checks MUST NOT reverse a
`VALIDATED`, `CANCELLED`, or `REQUIRES_ATTENTION` case. A diagnostic manual
check MAY be recorded for a terminal case but MUST NOT alter it without a
separate explicitly authorized resolution operation.

#### Scenario: Roll back a failed activation transition
- **WHEN** persistence fails after storing the check but before updating the customer
- **THEN** the complete check and transition operation rolls back

#### Scenario: Ignore stale scheduled work for a terminal case
- **WHEN** a queued `D3` check reaches a validation already completed at `H24`
- **THEN** Rewards performs no SISCA query and preserves the terminal state

### Requirement: The API must expose safe validation execution and status operations
The system SHALL expose an authenticated internal operation to execute a due,
retry, or manual validation check and an authorized operation to read a
customer's validation status. The status response SHALL include the Rewards case
state, registration time, next checkpoint time when pending, and safe last
outcome. It MUST NOT include CURP, raw SISCA payloads, credentials, or technical
exception details.

#### Scenario: Read pending validation status
- **WHEN** the owning authenticated customer requests validation status
- **THEN** Rewards returns `PENDING` with safe timing and outcome data without CURP or raw SISCA data

#### Scenario: Reject unauthorized internal execution
- **WHEN** an unauthenticated or unauthorized actor requests a validation check
- **THEN** Rewards rejects the operation without querying SISCA

### Requirement: Automatic and manual checks must share one application operation
The scheduler, internal API, and future operator tooling SHALL invoke the same
application-level validation execution use case. That use case SHALL remain
independent from FastAPI, scheduler libraries, and SQLAlchemy.

#### Scenario: Execute through the scheduler
- **WHEN** the scheduler finds a due pending validation
- **THEN** it invokes the same use case and transition rules used by an authorized internal API request

### Requirement: Registration must trigger an initial SISCA validation safely

Rewards SHALL commit the customer, consent and pending validation before it
immediately dispatches an initial SISCA query through the ordinary validation
service and configured gateway without making the registration response wait
for partner latency or retries. A validated result SHALL activate the AFORE
relation and make the resulting validation status available to authenticated
site reads. A pending, no-information or technical result SHALL preserve the
customer as an Invitado with H24 as the next scheduled checkpoint. SISCA
unavailability MUST NOT roll back the committed registration or expose raw
provider data to the site.

#### Scenario: Initial query validates the new customer

- **WHEN** registration commits and SISCA returns a valid accepted AFORE result
- **THEN** Rewards records the SISCA check and opaque correlation evidence
- **AND** activates the customer's AFORE relation
- **AND** publishes the validated status for the site to project the Bronce journey

#### Scenario: Initial query remains pending

- **WHEN** registration commits and SISCA has no information or a temporary result
- **THEN** Rewards records the observed safe outcome
- **AND** keeps the customer in the Invitado journey
- **AND** preserves H24, D3 and D5 scheduling from the original registration time

#### Scenario: SISCA is unavailable after registration commits

- **WHEN** the initial SISCA operation cannot be executed after the customer was stored
- **THEN** registration still succeeds with a pending validation
- **AND** H24 remains eligible for the ordinary or controlled UAT lifecycle

### Requirement: UAT controlled checkpoints must retain scheduled semantics

Rewards SHALL support explicitly authorized UAT-only controlled execution of
H24, D3 and D5 for synthetic test cases. The controlled execution MUST use the
same lifecycle behavior as a scheduled check, record that it is a UAT
controlled run and remain disabled in production. It MUST NOT change the
timing of the normal production scheduler.

#### Scenario: Synthetic UAT case runs the D5 checkpoint

- **WHEN** an authorized UAT operator executes D5 for a synthetic case
- **THEN** Rewards evaluates the case as if 120 hours have elapsed
- **AND** applies the ordinary validation lifecycle transition from the SISCA
  result
- **AND** records a controlled UAT audit event

#### Scenario: Regular production case reaches D5

- **WHEN** a production case reaches its fifth-day validation time
- **THEN** Rewards uses the normal production scheduler
- **AND** no controlled UAT execution path is available
