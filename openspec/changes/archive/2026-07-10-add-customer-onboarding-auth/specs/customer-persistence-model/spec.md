## ADDED Requirements

### Requirement: Auth users must persist login identity separately from customer identity
The system SHALL persist authentication users separately from customer records.
Auth users SHALL include a technical UUID, normalized unique email, password
hash, password update timestamp, optional email verification timestamp, and
audit timestamps. Customer records SHALL reference auth users through a unique
relationship.

#### Scenario: Create auth user for registered customer
- **WHEN** valid Rewards registration completes
- **THEN** the system persists an auth user and links the resulting customer to
  that auth user

#### Scenario: Enforce unique login email
- **WHEN** a second auth user is persisted with an email already assigned to an
  existing auth user after normalization
- **THEN** the system rejects the duplicate email persistence attempt

### Requirement: Customer consents must persist accepted terms
The system SHALL persist accepted customer consents separately from customer
identity. A terms and conditions consent SHALL include customer reference,
consent type, accepted timestamp, terms version, and audit metadata sufficient
to prove that terms were accepted before registration completed.

#### Scenario: Persist terms acceptance
- **WHEN** valid Rewards registration completes
- **THEN** the system persists a terms and conditions consent linked to the
  customer with accepted timestamp and terms version

#### Scenario: Preserve consent history
- **WHEN** terms acceptance has been recorded for a customer
- **THEN** later customer updates do not erase the historical consent record

## MODIFIED Requirements

### Requirement: Customers must be created only when the intake is approved
The system SHALL create a customer when valid Rewards registration completes,
without waiting for SISCA approval and without requiring a SISCA-originated
intake. A completed registration SHALL include accepted terms and conditions and
a linked auth user. The customer SHALL start with customer status
`PENDING_VALIDATION` and onboarding status `COMPLETED`, and the transaction
SHALL also create its initial pending SISCA validation.

#### Scenario: Create a registered customer before SISCA validation
- **WHEN** a customer completes valid Rewards registration with accepted terms
- **THEN** the system creates the customer in `PENDING_VALIDATION` with a linked
  auth user, consent record, and `PENDING` validation case

#### Scenario: Do not create a customer from SISCA validation data
- **WHEN** Rewards receives a SISCA validation result without a registered
  customer
- **THEN** the system rejects the orphan result and does not create customer
  identity from SISCA data

#### Scenario: Reject registration without consent
- **WHEN** customer registration data is otherwise valid but terms and
  conditions are not accepted
- **THEN** the system rejects customer creation and does not create the initial
  validation case

### Requirement: Customers must store the minimum agreed identity fields
The system SHALL persist the following minimum customer fields in this version:
technical UUID, auth user reference, Rewards ID, CURP, first name, last name,
email address, phone, postal code, state, city, current customer status, current
onboarding status, `created_at`, and `updated_at`. Afore operational data and
NSS MUST NOT be stored in `customers`.

#### Scenario: Store minimum customer identity fields
- **WHEN** the system creates a customer from valid Rewards registration
- **THEN** the persisted customer contains the agreed minimum identity fields
  and no Afore operational columns

#### Scenario: Do not store NSS on customer registration
- **WHEN** the system creates a customer from valid Rewards registration
- **THEN** the persisted customer record does not require or store NSS

### Requirement: Rewards ID must be required, unique, opaque, and transactional with customer creation
The system SHALL enforce `customers.rewards_id NOT NULL UNIQUE`. A customer and
its Rewards ID SHALL be created in the same transaction, and the system SHALL
NOT persist a customer row without a Rewards ID. Rewards ID SHALL be distinct
from the technical UUID, opaque, non-personal, immutable, non-reusable, and not
derived from CURP, email, phone, name, location, or password data. When
persistence rejects a customer write because `rewards_id` already exists, the
persistence and application contracts SHALL surface that outcome distinctly from
a duplicate CURP so the application can retry Rewards ID generation in a
bounded way.

#### Scenario: Create customer with required Rewards ID
- **WHEN** valid Rewards registration causes customer creation
- **THEN** the system persists the customer together with a non-null Rewards ID
  in the same transaction

#### Scenario: Reject duplicate Rewards ID
- **WHEN** a persistence operation attempts to store a Rewards ID already
  assigned to another customer
- **THEN** the system rejects the duplicate Rewards ID persistence attempt

#### Scenario: Surface duplicate Rewards ID distinctly from duplicate CURP
- **WHEN** persistence rejects a customer write because `rewards_id` already
  exists
- **THEN** the contracts report a Rewards-ID-specific uniqueness failure instead
  of an ambiguous generic duplicate error

## REMOVED Requirements

### Requirement: NSS must be required, text-based, repeatable, and immutable in Rewards-managed flows
**Reason**: NSS is no longer collected from customers in the agreed MVP
onboarding flow.

**Migration**: Remove NSS from registration schemas, domain commands,
customer persistence requirements, and database constraints. Existing
environments that already have a `customers.nss` column SHALL migrate away from
requiring it before the real onboarding flow is enabled.
