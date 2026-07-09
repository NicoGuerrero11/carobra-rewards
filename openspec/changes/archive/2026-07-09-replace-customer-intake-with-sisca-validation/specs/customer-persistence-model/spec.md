## ADDED Requirements

### Requirement: SISCA validation cases must persist independently from check attempts
The system SHALL persist one MVP validation case per registered customer and
SHALL persist every SISCA request attempt as a separate immutable check record.
The case SHALL contain current lifecycle state and scheduling summary; check
records SHALL contain attempt-specific evidence.

#### Scenario: Preserve multiple attempts for one validation
- **WHEN** a scheduled check requires a technical retry
- **THEN** the validation keeps one current case while each physical request is stored as its own check attempt

### Requirement: Validation persistence must enforce checkpoint idempotency
The persistence model SHALL enforce a database-backed uniqueness rule that
prevents more than one business execution of the same scheduled checkpoint for
one validation while allowing separately numbered physical retries.

#### Scenario: Reject a duplicate scheduled checkpoint execution
- **WHEN** concurrent workers try to create the same validation checkpoint execution
- **THEN** persistence permits one logical execution and exposes the existing execution to the losing worker

### Requirement: Validation records must preserve typed state and safe evidence
The validation case SHALL persist customer reference, status, `registered_at`,
checkpoint due instants, next checkpoint, last check time and outcome, last
valid raw SISCA fields, terminal timestamps, notification timestamp, and audit
timestamps. Each check SHALL persist checkpoint, attempt, request ID, execution
timestamps, available HTTP status, normalized outcome, valid raw SISCA fields,
and safe error category. Generic payload fields MUST NOT duplicate CURP or store
credentials and raw exceptions.

#### Scenario: Persist a terminal validation summary
- **WHEN** a validation reaches a terminal state
- **THEN** the case preserves its final status, outcome, terminal time, and notification requirement while its check history remains available

## MODIFIED Requirements

### Requirement: Customers must be created only when the intake is approved
The system SHALL create a customer when valid Rewards registration completes,
without waiting for SISCA approval and without requiring a SISCA-originated
intake. The customer SHALL start with customer status `PENDING_VALIDATION` and
onboarding status `PENDING`, and the transaction SHALL also create its initial
pending SISCA validation.

#### Scenario: Create a registered customer before SISCA validation
- **WHEN** a customer completes valid Rewards registration
- **THEN** the system creates the customer in `PENDING_VALIDATION` with a linked `PENDING` validation case

#### Scenario: Do not create a customer from SISCA validation data
- **WHEN** Rewards receives a SISCA validation result without a registered customer
- **THEN** the system rejects the orphan result and does not create customer identity from SISCA data

### Requirement: Rewards ID generation and communication must follow the functional lifecycle
The system SHALL generate Rewards ID when Rewards registration creates the
customer, SHALL keep it available while SISCA validation and onboarding are
pending, and SHALL communicate it to SISCA only after the separately defined
onboarding and validation prerequisites are complete.

#### Scenario: Keep Rewards ID during pending validation
- **WHEN** a registered customer is waiting for SISCA validation
- **THEN** the customer already has a Rewards ID and the system does not communicate it to SISCA yet

### Requirement: Customers must be linked to services through a separate relation
The system SHALL persist customer-service assignments through a separate
relation with its own technical UUID, customer reference, service reference,
current relation status, optional `started_at`, optional `ended_at`, `created_at`,
and `updated_at`. The AFORE relation SHALL become `ACTIVE` only when the
customer's validation reaches `VALIDATED`.

#### Scenario: Activate customer AFORE relation after validation
- **WHEN** a registered customer's SISCA validation reaches `VALIDATED`
- **THEN** the system activates the relation linking that customer to the `AFORE` service

### Requirement: Persistence must use internal Rewards statuses without reusing SISCA catalogs
The system SHALL store internal statuses as text columns controlled by Python
enums and SHALL NOT use PostgreSQL ENUM. Customer status SHALL include
`PENDING_VALIDATION`, `PENDING_ONBOARDING`, `ACTIVE`, `INACTIVE`, and `BLOCKED`;
onboarding status SHALL include `PENDING`, `COMPLETED`, and `EXPIRED`;
customer-service status SHALL include `ACTIVE`, `INACTIVE`, and `ENDED`;
validation status SHALL include `PENDING`, `VALIDATED`, `CANCELLED`, and
`REQUIRES_ATTENTION`; and check outcome SHALL include `MATCH_VALIDATED`,
`MATCH_TEMPORARY_PENDING`, `MATCH_CANCELLED`, `MATCH_NOT_ELIGIBLE`,
`NO_INFORMATION`, and `TECHNICAL_FAILURE`. Raw SISCA catalogs MUST NOT be used
as internal state values.

#### Scenario: Store a pending registered customer with internal states
- **WHEN** registration creates the customer and validation case
- **THEN** persistence uses `PENDING_VALIDATION` and `PENDING` rather than a raw SISCA status

#### Scenario: Preserve raw SISCA status separately
- **WHEN** a check stores a valid `estatus_sf`
- **THEN** the raw value is stored as check evidence and not as the validation lifecycle state

### Requirement: Foreign keys must preserve history through restrictive deletes
The system SHALL define restrictive customer and service foreign keys for
historical intake, customer-service, validation, and validation-check records.
Deleting a customer with validation history, a validation with checks, or a
service with customer relations MUST be blocked rather than cascaded.

#### Scenario: Reject customer deletion with validation history
- **WHEN** a delete targets a customer referenced by a SISCA validation
- **THEN** the foreign key blocks the destructive delete

#### Scenario: Reject validation deletion with check history
- **WHEN** a delete targets a validation referenced by one or more checks
- **THEN** the foreign key blocks the destructive delete

### Requirement: Timestamps must be timezone-aware, UTC-based, and updated consistently
The system SHALL store timestamps as timezone-aware UTC values, SHALL derive
validation checkpoint due instants from `registered_at`, SHALL record each
physical check start and completion, SHALL leave terminal timestamps nullable
until their transitions occur, and SHALL update `updated_at` on every mutable
record update.

#### Scenario: Persist exact UTC checkpoint instants
- **WHEN** a validation is created
- **THEN** its 24-hour, 72-hour, and 120-hour due instants are stored or deterministically derived as timezone-aware UTC values

#### Scenario: Preserve immutable check timestamps
- **WHEN** a completed check is followed by another attempt
- **THEN** the earlier check timestamps remain unchanged

### Requirement: Additional indexes must be limited to justified lookup paths
The system SHALL avoid indexes duplicated by unique constraints. It SHALL add
indexes needed to find due pending validations, retrieve validations by
customer, retrieve check history by validation, and enforce checkpoint
idempotency.

#### Scenario: Support due-validation lookup
- **WHEN** the scheduler queries pending validations whose next checkpoint is due
- **THEN** the query is supported by a justified status-and-due-time index

### Requirement: Unit of work must support future atomic approval flow
The system SHALL share one transaction across customer, service,
customer-service, validation, and validation-check repositories. It SHALL support
atomic registration plus validation creation and atomic check plus lifecycle
transition operations.

#### Scenario: Roll back registration and validation together
- **WHEN** validation creation fails during customer registration
- **THEN** the unit of work rolls back the customer, Rewards ID, and validation writes

#### Scenario: Roll back check and activation together
- **WHEN** customer activation fails after a successful check is prepared
- **THEN** the unit of work rolls back the check and all lifecycle changes

## REMOVED Requirements

### Requirement: Intake requests can be stored independently from customers
**Reason**: New customer creation is owned by Rewards registration, not by incoming SISCA intake requests.
**Migration**: Keep existing intake rows read-only for audit; use `sisca_validations` and `sisca_validation_checks` for new operations.

### Requirement: Storing an intake request must not create a customer or Rewards ID by itself
**Reason**: New operations no longer store SISCA intake requests.
**Migration**: Registration creates the customer and validation atomically.

### Requirement: Intake requests must be unique per source and external request identifier
**Reason**: SISCA no longer pushes source events into Rewards.
**Migration**: Use validation checkpoint and attempt idempotency keys.

### Requirement: Intake requests must preserve processing state and details separately
**Reason**: Validation cases and checks replace intake processing state for the target flow.
**Migration**: Store lifecycle state on `sisca_validations` and attempt evidence on `sisca_validation_checks`.

### Requirement: Intake payloads must preserve the original received representation
**Reason**: The new typed validation contract does not accept a full customer payload from SISCA.
**Migration**: Preserve only typed validation evidence and safe transport metadata for new checks.

### Requirement: Payload and processing details must be treated as sensitive data
**Reason**: Generic intake payload and processing-detail storage is not part of the new validation model.
**Migration**: Apply the new typed evidence and sensitive-data rules to validation records while retaining historical intake data under existing controls.

### Requirement: Intake-to-customer association must occur after approval and must not be reassigned in normal flows
**Reason**: The customer exists before validation and owns the validation relation directly.
**Migration**: Link the validation to the customer at registration time.

### Requirement: Intake status updates must be idempotent and preserve first successful processing time
**Reason**: Intake statuses are replaced by validation lifecycle transitions and immutable check attempts.
**Migration**: Use terminal validation timestamps and checkpoint idempotency.
