## MODIFIED Requirements

### Requirement: Intake requests must preserve processing state and details separately
The system SHALL store the primary processing outcome in `processing_status` and
SHALL store structured supporting details in nullable `processing_details`
JSONB. `processing_details` MAY contain missing fields, errors, reasons,
validations, eligibility outcome, and relevant processing metadata, but it MUST
NOT replace the primary status. When a normal application flow expects to update
the status of an existing intake request and that intake request does not exist,
the persistence contract SHALL fail explicitly instead of ignoring the missing
record.

#### Scenario: Store structured processing details
- **WHEN** Rewards records an intake request with missing data or validation findings
- **THEN** the system stores the primary status in `processing_status` and the structured findings in `processing_details`

#### Scenario: Reject status update when expected intake does not exist
- **WHEN** a normal application flow attempts to update the status of an intake request that should exist within the transaction but no record is found
- **THEN** the persistence contract rejects the operation explicitly

#### Scenario: Keep successful processing details null
- **WHEN** a normal application flow persists a final successful intake outcome of `APPROVED` or `ALREADY_ACTIVE`
- **THEN** the persistence contract stores `processing_details` as null

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
- **WHEN** Rewards persists a customer or intake request with CURP containing surrounding spaces or lowercase characters
- **THEN** the structured CURP column stores the `strip + uppercase` normalized value

#### Scenario: Reject duplicate CURP
- **WHEN** a second customer is persisted with a normalized CURP already assigned to another customer
- **THEN** the system rejects the duplicate CURP persistence attempt

#### Scenario: Surface duplicate CURP distinctly from duplicate Rewards ID
- **WHEN** persistence rejects a customer write because the normalized CURP is already assigned to another customer
- **THEN** the contracts report a CURP-specific uniqueness failure instead of an ambiguous generic duplicate error

### Requirement: Rewards ID must be required, unique, opaque, and transactional with customer creation
The system SHALL enforce `customers.rewards_id NOT NULL UNIQUE`. A customer and
its Rewards ID SHALL be created in the same transaction, and the system SHALL
NOT persist a customer row without a Rewards ID. Rewards ID SHALL be distinct
from the technical UUID, opaque, non-personal, immutable, non-reusable, and
not derived from CURP, NSS, email, or phone. When persistence rejects a
customer write because `rewards_id` already exists, the persistence and
application contracts SHALL surface that outcome distinctly from a duplicate
CURP so the application can retry Rewards ID generation in a bounded way.

#### Scenario: Create customer with required Rewards ID
- **WHEN** an approved intake causes customer creation
- **THEN** the system persists the customer together with a non-null Rewards ID in the same transaction

#### Scenario: Reject duplicate Rewards ID
- **WHEN** a persistence operation attempts to store a Rewards ID already assigned to another customer
- **THEN** the system rejects the duplicate Rewards ID persistence attempt

#### Scenario: Surface duplicate Rewards ID distinctly from duplicate CURP
- **WHEN** persistence rejects a customer write because `rewards_id` already exists
- **THEN** the contracts report a Rewards-ID-specific uniqueness failure instead of an ambiguous generic duplicate error

### Requirement: Persistence must classify customer and intake uniqueness failures by concrete constraint
The infrastructure SHALL classify persistence errors by the concrete PostgreSQL
constraint that failed. The contracts SHALL distinguish at least:
`DuplicateExternalRequestError`, `DuplicateCustomerCurpError`,
`DuplicateCustomerRewardsIdError`, `DuplicateCustomerServiceError`,
`IntakeRequestNotFoundError`, `IntakeCustomerReassignmentError`, and
`UnexpectedPersistenceError`. The infrastructure SHALL NOT classify arbitrary
`IntegrityError` cases as duplicate CURP, duplicate Rewards ID, or replayable
duplicate external request without confirming the specific failed constraint.

#### Scenario: Map duplicate external request by concrete constraint
- **WHEN** PostgreSQL rejects an intake insert specifically on the unique constraint for `(source, external_request_id)`
- **THEN** the persistence contract reports `DuplicateExternalRequestError`

#### Scenario: Keep unknown integrity failures as unexpected persistence errors
- **WHEN** PostgreSQL reports a foreign key, nullability, unknown constraint, or connection-related persistence failure outside the known classified constraints
- **THEN** the persistence contract reports `UnexpectedPersistenceError`

### Requirement: Intake-to-customer association must occur after approval and must not be reassigned in normal flows
The system SHALL define `customer_intake_requests.customer_id` as nullable
before approval, SHALL assign it when the intake produces the approved customer,
SHALL preserve the original intake record, and SHALL protect that association
from reassignment in normal flows. When a normal application flow expects to
associate an existing intake with a customer and the intake does not exist, the
persistence contract SHALL fail explicitly instead of ignoring the missing
record.

#### Scenario: Associate intake with approved customer later
- **WHEN** an approved intake creates a customer
- **THEN** the system updates the original intake request to reference that customer without replacing the intake record

#### Scenario: Keep association idempotent for the same customer
- **WHEN** a normal application flow associates an intake that is already linked to the same customer
- **THEN** the persistence contract treats the operation as successful and idempotent

#### Scenario: Reject intake reassignment in normal flows
- **WHEN** a normal application flow attempts to change an already assigned intake `customer_id` to a different customer
- **THEN** the system rejects the reassignment attempt

#### Scenario: Reject customer association when expected intake does not exist
- **WHEN** a normal application flow attempts to associate a customer with an intake request that should exist within the transaction but no record is found
- **THEN** the persistence contract rejects the operation explicitly

### Requirement: Intake status updates must be idempotent and preserve first successful processing time
When a normal application flow updates an intake status, the persistence
contract SHALL fail explicitly if the intake does not exist, SHALL treat an
update to the same status as idempotent, SHALL set `processed_at` when the
intake reaches `APPROVED` or `ALREADY_ACTIVE` for the first time, SHALL NOT
overwrite `processed_at` when the same final status is applied again, SHALL
store `processing_details = NULL` for those successful final statuses, and
SHALL NOT report success if the expected intake was not updated.

#### Scenario: Treat same-state update as idempotent
- **WHEN** a normal application flow applies the same intake status that is already stored on the expected intake
- **THEN** the persistence contract treats the operation as idempotent instead of failing

#### Scenario: Persist first successful processed_at only once
- **WHEN** a normal application flow moves an intake to `APPROVED` or `ALREADY_ACTIVE` and later repeats the same final status
- **THEN** the first successful update sets `processed_at` and the repeated same-state update does not overwrite it
