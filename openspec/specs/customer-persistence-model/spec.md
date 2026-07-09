# Customer Persistence Model

## Purpose

Define the persistence model for Rewards-owned customer registration, customers,
services, customer-service relations, SISCA validation cases, and SISCA
validation check history in Carobra Rewards.

This specification describes the current persistence baseline for the target
Rewards-led registration plus SISCA-only validation model. SISCA does not push a
full customer intake payload into Rewards; Rewards creates the customer identity
and stores typed SISCA validation evidence separately.

## Requirements

### Requirement: CURP must be normalized, unique, and immutable in Rewards-managed flows
The system SHALL normalize CURP using `strip + uppercase` before persisting
structured columns, SHALL enforce `customers.curp NOT NULL UNIQUE` on the
normalized value, SHALL treat CURP as the person identifier within the flow,
SHALL NOT use CURP as the primary key or as Rewards ID, and SHALL prevent CURP
updates through Rewards-managed flows after customer creation. When persistence
rejects a customer write because the normalized CURP already belongs to another
customer, the persistence and application contracts SHALL surface that outcome
distinctly from a duplicate Rewards ID.

#### Scenario: Normalize CURP before persistence
- **WHEN** Rewards persists a customer with CURP containing surrounding spaces or lowercase characters
- **THEN** the structured CURP column stores the `strip + uppercase` normalized value

#### Scenario: Reject duplicate CURP
- **WHEN** a second customer is persisted with a normalized CURP already assigned to another customer
- **THEN** the system rejects the duplicate CURP persistence attempt

#### Scenario: Surface duplicate CURP distinctly from duplicate Rewards ID
- **WHEN** persistence rejects a customer write because the normalized CURP is already assigned to another customer
- **THEN** the contracts report a CURP-specific uniqueness failure instead of an ambiguous generic duplicate error

### Requirement: NSS must be required, text-based, repeatable, and immutable in Rewards-managed flows
The system SHALL enforce `customers.nss NOT NULL`, SHALL store NSS as text
preserving leading zeroes, SHALL NOT use NSS as the primary key, SHALL NOT use
NSS as a substitute for CURP, SHALL allow repeated NSS values in this version,
and SHALL prevent NSS updates through Rewards-managed flows after customer
creation.

#### Scenario: Preserve leading zeroes in NSS
- **WHEN** Rewards persists a customer with an NSS value that starts with zeroes
- **THEN** the stored NSS preserves the original zero-prefixed value

#### Scenario: Allow repeated NSS values
- **WHEN** two different customers are persisted with different CURPs and the same NSS value
- **THEN** the system allows both records as long as all other constraints are satisfied

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

### Requirement: Customers must store the minimum agreed identity fields
The system SHALL persist the following minimum customer fields in this version:
technical UUID, Rewards ID, CURP, NSS, name, email address, optional phone,
optional postal code, current customer status, current onboarding status,
`created_at`, and `updated_at`. Afore operational data MUST NOT be stored in
`customers`.

#### Scenario: Store minimum customer identity fields
- **WHEN** the system creates a customer from valid Rewards registration
- **THEN** the persisted customer contains the agreed minimum identity fields and no Afore operational columns

### Requirement: Rewards ID must be required, unique, opaque, and transactional with customer creation
The system SHALL enforce `customers.rewards_id NOT NULL UNIQUE`. A customer and
its Rewards ID SHALL be created in the same transaction, and the system SHALL
NOT persist a customer row without a Rewards ID. Rewards ID SHALL be distinct
from the technical UUID, opaque, non-personal, immutable, non-reusable, and not
derived from CURP, NSS, email, or phone. When persistence rejects a customer
write because `rewards_id` already exists, the persistence and application
contracts SHALL surface that outcome distinctly from a duplicate CURP so the
application can retry Rewards ID generation in a bounded way.

#### Scenario: Create customer with required Rewards ID
- **WHEN** valid Rewards registration causes customer creation
- **THEN** the system persists the customer together with a non-null Rewards ID in the same transaction

#### Scenario: Reject duplicate Rewards ID
- **WHEN** a persistence operation attempts to store a Rewards ID already assigned to another customer
- **THEN** the system rejects the duplicate Rewards ID persistence attempt

#### Scenario: Surface duplicate Rewards ID distinctly from duplicate CURP
- **WHEN** persistence rejects a customer write because `rewards_id` already exists
- **THEN** the contracts report a Rewards-ID-specific uniqueness failure instead of an ambiguous generic duplicate error

### Requirement: Persistence must classify customer uniqueness failures by concrete constraint
The infrastructure SHALL classify persistence errors by the concrete PostgreSQL
constraint that failed. The contracts SHALL distinguish at least duplicate
customer CURP, duplicate customer Rewards ID, duplicate customer-service
relation, missing expected records, and unexpected persistence errors. The
infrastructure SHALL NOT classify arbitrary `IntegrityError` cases as duplicate
CURP, duplicate Rewards ID, or replayable duplicate operations without
confirming the specific failed constraint.

#### Scenario: Keep unknown integrity failures as unexpected persistence errors
- **WHEN** PostgreSQL reports a foreign key, nullability, unknown constraint, or connection-related persistence failure outside the known classified constraints
- **THEN** the persistence contract reports an unexpected persistence error

### Requirement: Rewards ID generation and communication must follow the functional lifecycle
The system SHALL generate Rewards ID when Rewards registration creates the
customer, SHALL keep it available while SISCA validation and onboarding are
pending, and SHALL communicate it to SISCA only after the separately defined
onboarding and validation prerequisites are complete.

#### Scenario: Keep Rewards ID during pending validation
- **WHEN** a registered customer is waiting for SISCA validation
- **THEN** the customer already has a Rewards ID and the system does not communicate it to SISCA yet

### Requirement: Technical UUID and Rewards ID must remain separate identifiers
The system SHALL use PostgreSQL UUID for technical identifiers, `python
uuid.UUID` in application-side representations, and application-side UUID
generation. The technical UUID SHALL remain separate from Rewards ID and SHALL
NOT be communicated as Rewards ID.

#### Scenario: Keep technical UUID distinct from Rewards ID
- **WHEN** a customer record is persisted
- **THEN** the system stores a technical UUID separately from the Rewards ID and does not treat them as interchangeable

### Requirement: Service types must be modeled independently from customer identity
The system SHALL persist service types separately from customers and SHALL
support at least the `AFORE` service code. `AFORE` MUST be initialized
deterministically by the Alembic migration and removed correctly by downgrade.

#### Scenario: Initialize AFORE service through migration
- **WHEN** the migration for the initial persistence model is applied
- **THEN** the system creates the `AFORE` service record deterministically so application flows can query it by code

### Requirement: Customers must be linked to services through a separate relation
The system SHALL persist customer-service assignments through a separate
relation with its own technical UUID, customer reference, service reference,
current relation status, optional `started_at`, optional `ended_at`,
`created_at`, and `updated_at`. The AFORE relation SHALL become `ACTIVE` only
when the customer's validation reaches `VALIDATED`.

#### Scenario: Activate customer AFORE relation after validation
- **WHEN** a registered customer's SISCA validation reaches `VALIDATED`
- **THEN** the system activates the relation linking that customer to the `AFORE` service

### Requirement: Customer-service relations must be unique per customer and service type
The system SHALL enforce a uniqueness rule equivalent to `UNIQUE(customer_id,
service_id)` so a customer has at most one consolidated relation per service
type.

#### Scenario: Reject duplicate customer-service relation
- **WHEN** a second relation is persisted for the same customer and service type
- **THEN** the system rejects the duplicate relation persistence attempt

### Requirement: Losing a service must not delete the customer identity
The system SHALL represent service loss using relation status changes and-or
`ended_at`, SHALL preserve the customer and Rewards ID, and SHALL not create a
new customer identity because a service ended.

#### Scenario: Preserve customer after service loss
- **WHEN** a customer loses the AFORE service
- **THEN** the system keeps the customer and Rewards ID while updating the existing customer-service relation state and-or end date

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
and safe error category. Generic payload fields MUST NOT duplicate CURP or
store credentials and raw exceptions.

#### Scenario: Persist a terminal validation summary
- **WHEN** a validation reaches a terminal state
- **THEN** the case preserves its final status, outcome, terminal time, and notification requirement while its check history remains available

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
customer-service, validation, and validation-check repositories. It SHALL
support atomic registration plus validation creation and atomic check plus
lifecycle transition operations.

#### Scenario: Roll back registration and validation together
- **WHEN** validation creation fails during customer registration
- **THEN** the unit of work rolls back the customer, Rewards ID, and validation writes

#### Scenario: Roll back check and activation together
- **WHEN** customer activation fails after a successful check is prepared
- **THEN** the unit of work rolls back the check and all lifecycle changes

### Requirement: Application and domain layers must remain independent from SQLAlchemy
The system SHALL keep SQLAlchemy models, migrations, and database-specific
adapters inside infrastructure, SHALL define repository contracts in ports, and
SHALL keep application and domain layers executable without importing SQLAlchemy
or receiving `AsyncSession`.

#### Scenario: Preserve module independence from SQLAlchemy
- **WHEN** persistence support is implemented
- **THEN** application and domain tests still run without importing SQLAlchemy or requiring a database session
