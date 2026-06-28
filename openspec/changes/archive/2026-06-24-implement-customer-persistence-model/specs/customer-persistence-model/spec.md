## ADDED Requirements

### Requirement: Intake requests can be stored independently from customers
The system SHALL persist each intake request as its own record even when no customer exists yet. An intake request MUST support: technical UUID, source, external request identifier, normalized CURP, `processing_status`, nullable `processing_details`, `original_payload`, nullable `customer_id`, `received_at`, nullable `processed_at`, `created_at`, and `updated_at`.

#### Scenario: Persist intake without customer
- **WHEN** Rewards receives a new intake request before approval
- **THEN** the system stores the intake request with `customer_id` set to null

### Requirement: Storing an intake request must not create a customer or Rewards ID by itself
The system SHALL NOT create a customer or a Rewards ID merely because an intake request was received, persisted, found incomplete, found not approved, found not eligible, found pending eligibility, or linked to an already active customer.

#### Scenario: Do not create customer before approval
- **WHEN** an intake request is stored with any processing status other than `APPROVED`
- **THEN** the system does not create a customer row and does not assign a Rewards ID

### Requirement: Intake requests must be unique per source and external request identifier
The system SHALL enforce a uniqueness rule equivalent to `UNIQUE(source, external_request_id)` so the same source event cannot be persisted twice as a new intake request.

#### Scenario: Reject duplicate external request key
- **WHEN** a second intake request is persisted with the same `source` and `external_request_id` as an existing request
- **THEN** the system rejects the duplicate persistence attempt

### Requirement: Intake requests must preserve processing state and details separately
The system SHALL store the primary processing outcome in `processing_status` and SHALL store structured supporting details in nullable `processing_details` JSONB. `processing_details` MAY contain missing fields, errors, reasons, validations, eligibility outcome, and relevant processing metadata, but it MUST NOT replace the primary status.

#### Scenario: Store structured processing details
- **WHEN** Rewards records an intake request with missing data or validation findings
- **THEN** the system stores the primary status in `processing_status` and the structured findings in `processing_details`

### Requirement: Intake payloads must preserve the original received representation
The system SHALL store `original_payload` as JSONB, SHALL preserve the original received representation without applying normalization changes to that payload, and SHALL keep normalized structured columns separate from the original payload.

#### Scenario: Preserve original payload while normalizing structured fields
- **WHEN** Rewards normalizes CURP before persisting structured intake and customer columns
- **THEN** the normalized CURP is stored in structured columns while `original_payload` remains intact with the originally received value

### Requirement: Payload and processing details must be treated as sensitive data
The system SHALL treat `original_payload` and `processing_details` as sensitive information, SHALL avoid exposing them wholesale in generic responses, and SHALL avoid uncontrolled full-payload logging.

#### Scenario: Keep sensitive payload out of generic exposure
- **WHEN** the system records an intake request containing personal or operational SISCA data
- **THEN** the persistence model retains that data for traceability without requiring unrestricted payload exposure in default responses or logs

### Requirement: CURP must be normalized, unique, and immutable in Rewards-managed flows
The system SHALL normalize CURP using `strip + uppercase` before persisting structured columns, SHALL enforce `customers.curp NOT NULL UNIQUE` on the normalized value, SHALL treat CURP as the person identifier within the flow, SHALL NOT use CURP as the primary key or as Rewards ID, and SHALL prevent CURP updates through Rewards-managed flows after customer creation.

#### Scenario: Normalize CURP before persistence
- **WHEN** Rewards persists a customer or intake request with CURP containing surrounding spaces or lowercase characters
- **THEN** the structured CURP column stores the `strip + uppercase` normalized value

#### Scenario: Reject duplicate CURP
- **WHEN** a second customer is persisted with a normalized CURP already assigned to another customer
- **THEN** the system rejects the duplicate CURP persistence attempt

### Requirement: NSS must be required, text-based, repeatable, and immutable in Rewards-managed flows
The system SHALL enforce `customers.nss NOT NULL`, SHALL store NSS as text preserving leading zeroes, SHALL NOT use NSS as the primary key, SHALL NOT use NSS as a substitute for CURP, SHALL allow repeated NSS values in this version, and SHALL prevent NSS updates through Rewards-managed flows after customer creation.

#### Scenario: Preserve leading zeroes in NSS
- **WHEN** Rewards persists a customer with an NSS value that starts with zeroes
- **THEN** the stored NSS preserves the original zero-prefixed value

#### Scenario: Allow repeated NSS values
- **WHEN** two different customers are persisted with different CURPs and the same NSS value
- **THEN** the system allows both records as long as all other constraints are satisfied

### Requirement: Customers must be created only when the intake is approved
The system SHALL create a customer only when the intake result is `APPROVED`. When the customer is created, the initial customer status SHALL be `PENDING_ONBOARDING` and the initial onboarding status SHALL be `PENDING`.

#### Scenario: Create approved customer only
- **WHEN** an intake reaches the `APPROVED` processing status
- **THEN** the system creates the customer with customer status `PENDING_ONBOARDING` and onboarding status `PENDING`

### Requirement: Customers must store the minimum agreed identity fields
The system SHALL persist the following minimum customer fields in this version: technical UUID, Rewards ID, CURP, NSS, name, email address, optional phone, optional postal code, current customer status, current onboarding status, `created_at`, and `updated_at`. Afore operational data MUST NOT be stored in `customers`.

#### Scenario: Store minimum customer identity fields
- **WHEN** the system creates a customer from an approved intake
- **THEN** the persisted customer contains the agreed minimum identity fields and no Afore operational columns

### Requirement: Rewards ID must be required, unique, opaque, and transactional with customer creation
The system SHALL enforce `customers.rewards_id NOT NULL UNIQUE`. A customer and its Rewards ID SHALL be created in the same transaction, and the system SHALL NOT persist a customer row without a Rewards ID. Rewards ID SHALL be distinct from the technical UUID, opaque, non-personal, immutable, non-reusable, and not derived from CURP, NSS, email, or phone.

#### Scenario: Create customer with required Rewards ID
- **WHEN** an approved intake causes customer creation
- **THEN** the system persists the customer together with a non-null Rewards ID in the same transaction

#### Scenario: Reject duplicate Rewards ID
- **WHEN** a persistence operation attempts to store a Rewards ID already assigned to another customer
- **THEN** the system rejects the duplicate Rewards ID persistence attempt

### Requirement: Rewards ID generation and communication must follow the functional lifecycle
The system SHALL generate Rewards ID when the intake is approved, SHALL keep it available before onboarding completes, and SHALL communicate it to SISCA only after onboarding reaches `COMPLETED`.

#### Scenario: Keep Rewards ID before onboarding completion
- **WHEN** a customer has been approved but onboarding is still `PENDING`
- **THEN** the customer already has a Rewards ID and the system does not require SISCA communication yet

### Requirement: Technical UUID and Rewards ID must remain separate identifiers
The system SHALL use PostgreSQL UUID for technical identifiers, `python uuid.UUID` in application-side representations, and application-side UUID generation. The technical UUID SHALL remain separate from Rewards ID and SHALL NOT be communicated as Rewards ID.

#### Scenario: Keep technical UUID distinct from Rewards ID
- **WHEN** a customer record is persisted
- **THEN** the system stores a technical UUID separately from the Rewards ID and does not treat them as interchangeable

### Requirement: Intake-to-customer association must occur after approval and must not be reassigned in normal flows
The system SHALL define `customer_intake_requests.customer_id` as nullable before approval, SHALL assign it when the intake produces the approved customer, SHALL preserve the original intake record, and SHALL protect that association from reassignment in normal flows.

#### Scenario: Associate intake with approved customer later
- **WHEN** an approved intake creates a customer
- **THEN** the system updates the original intake request to reference that customer without replacing the intake record

#### Scenario: Reject intake reassignment in normal flows
- **WHEN** a normal application flow attempts to change an already assigned intake `customer_id` to a different customer
- **THEN** the system rejects the reassignment attempt

### Requirement: Service types must be modeled independently from customer identity
The system SHALL persist service types separately from customers and SHALL support at least the `AFORE` service code. `AFORE` MUST be initialized deterministically by the Alembic migration and removed correctly by downgrade.

#### Scenario: Initialize AFORE service through migration
- **WHEN** the migration for the initial persistence model is applied
- **THEN** the system creates the `AFORE` service record deterministically so application flows can query it by code

### Requirement: Customers must be linked to services through a separate relation
The system SHALL persist customer-service assignments through a separate relation with its own technical UUID, customer reference, service reference, current relation status, optional `started_at`, optional `ended_at`, `created_at`, and `updated_at`.

#### Scenario: Create customer-AFORE relation
- **WHEN** a customer is approved for the MVP AFORE service
- **THEN** the system persists a customer-service relation linking that customer with the `AFORE` service type

### Requirement: Customer-service relations must be unique per customer and service type
The system SHALL enforce a uniqueness rule equivalent to `UNIQUE(customer_id, service_id)` so a customer has at most one consolidated relation per service type.

#### Scenario: Reject duplicate customer-service relation
- **WHEN** a second relation is persisted for the same customer and service type
- **THEN** the system rejects the duplicate relation persistence attempt

### Requirement: Losing a service must not delete the customer identity
The system SHALL represent service loss using relation status changes and-or `ended_at`, SHALL preserve the customer and Rewards ID, and SHALL not create a new customer identity because a service ended.

#### Scenario: Preserve customer after service loss
- **WHEN** a customer loses the AFORE service
- **THEN** the system keeps the customer and Rewards ID while updating the existing customer-service relation state and-or end date

### Requirement: Persistence must use internal Rewards statuses without reusing SISCA catalogs
The system SHALL store internal statuses as text columns controlled by Python enums and SHALL NOT use PostgreSQL ENUM in this first version. The initial persistence statuses SHALL be:
`customer_intake_requests.processing_status`: `RECEIVED`, `PROCESSING`, `INCOMPLETE`, `NOT_APPROVED`, `NOT_ELIGIBLE`, `ELIGIBILITY_PENDING`, `APPROVED`, `ALREADY_ACTIVE`
`customers.customer_status`: `PENDING_ONBOARDING`, `ACTIVE`, `INACTIVE`, `BLOCKED`
`customers.onboarding_status`: `PENDING`, `COMPLETED`, `EXPIRED`
`customer_services.status`: `ACTIVE`, `INACTIVE`, `ENDED`

#### Scenario: Store approved customer with initial internal statuses
- **WHEN** an intake is approved and a customer is created
- **THEN** the customer starts with `PENDING_ONBOARDING`, onboarding starts with `PENDING`, and SISCA state catalogs are not reused as those internal statuses

### Requirement: Foreign keys must preserve history through restrictive deletes
The system SHALL define `customer_intake_requests.customer_id -> customers.id ON DELETE RESTRICT`, `customer_services.customer_id -> customers.id ON DELETE RESTRICT`, and `customer_services.service_id -> services.id ON DELETE RESTRICT`. The system SHALL NOT use destructive cascades or orphan deletion to represent historical changes.

#### Scenario: Reject destructive delete when references exist
- **WHEN** a delete operation targets a customer or service that is still referenced by intake or customer-service records
- **THEN** the foreign key constraint blocks the destructive delete

### Requirement: Timestamps must be timezone-aware, UTC-based, and updated consistently
The system SHALL store timestamps as `TIMESTAMP WITH TIME ZONE`, SHALL use UTC values, SHALL define `received_at` as the moment Rewards receives the intake request, SHALL leave `processed_at` nullable until processing completes, and SHALL update `updated_at` on every persistent update.

#### Scenario: Persist timezone-aware timestamps
- **WHEN** the system persists or updates an intake request, customer, service, or customer-service relation
- **THEN** the corresponding timestamps are stored as timezone-aware UTC values

#### Scenario: Update updated_at on persistent changes
- **WHEN** a persisted row is modified and saved again
- **THEN** the system updates `updated_at` to a later timezone-aware value

### Requirement: Additional indexes must be limited to justified lookup paths
The system SHALL avoid adding duplicate indexes for unique constraints that already support lookup paths. The system MAY add only justified additional indexes for `customer_intake_requests.customer_id`, `customer_intake_requests.processing_status`, and `customer_services.service_id`.

#### Scenario: Avoid duplicate indexes on unique columns
- **WHEN** the persistence schema is defined
- **THEN** the schema does not add redundant extra indexes for columns already covered by unique constraints

### Requirement: Unit of work must support future atomic approval flow
The system SHALL define a unit of work that shares a single transaction across intake, customer, service, and customer-service repositories so a later approval flow can atomically create the customer, persist the Rewards ID, create the AFORE relation, associate the intake, update intake status, and commit or fully roll back.

#### Scenario: Roll back a multi-repository approval operation
- **WHEN** a future approval operation fails after partially using intake, customer, and customer-service repositories within one unit of work
- **THEN** the transaction can roll back all pending persistence changes together

### Requirement: Application and domain layers must remain independent from SQLAlchemy
The system SHALL keep SQLAlchemy models, migrations, and database-specific adapters inside infrastructure, SHALL define repository contracts in ports, and SHALL keep application and domain layers executable without importing SQLAlchemy or receiving `AsyncSession`.

#### Scenario: Preserve module independence from SQLAlchemy
- **WHEN** persistence support is implemented
- **THEN** application and domain tests still run without importing SQLAlchemy or requiring a database session
