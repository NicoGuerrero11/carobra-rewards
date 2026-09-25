## MODIFIED Requirements

### Requirement: Rewards ID must be required, unique, opaque, and transactional with customer creation
The system SHALL enforce `customers.rewards_id NOT NULL UNIQUE` and a canonical format of exactly nine ASCII decimal digits with a non-zero first digit. A customer and its Rewards ID SHALL be created in the same transaction, and the system SHALL NOT persist a customer row without a Rewards ID. Rewards ID SHALL be distinct from the technical UUID, opaque, non-personal, immutable after the controlled legacy migration, non-reusable, and not derived from CURP, email, phone, name, location, password data, or a sequential customer count. When persistence rejects a customer write because `rewards_id` already exists, the persistence and application contracts SHALL surface that outcome distinctly from a duplicate CURP so the application can retry cryptographically random Rewards ID generation in a bounded way.

#### Scenario: Create customer with required numeric Rewards ID
- **WHEN** valid Rewards registration causes customer creation
- **THEN** the system persists the customer together with a non-null nine-digit numeric Rewards ID in the same transaction

#### Scenario: Reject a non-canonical Rewards ID
- **WHEN** a persistence operation attempts to store a Rewards ID containing a prefix, letters, separators, fewer or more than nine digits, or a leading zero
- **THEN** the database rejects the non-canonical identifier

#### Scenario: Reject duplicate Rewards ID
- **WHEN** a persistence operation attempts to store a Rewards ID already assigned to another customer
- **THEN** the system rejects the duplicate Rewards ID persistence attempt

#### Scenario: Surface duplicate Rewards ID distinctly from duplicate CURP
- **WHEN** persistence rejects a customer write because `rewards_id` already exists
- **THEN** the contracts report a Rewards-ID-specific uniqueness failure instead of an ambiguous generic duplicate error

#### Scenario: Generate identity without customer-derived data
- **WHEN** the application generates a Rewards ID for registration
- **THEN** it uses a cryptographically secure random value from the canonical numeric range and does not derive it from customer data or registration order

## ADDED Requirements

### Requirement: Legacy Rewards IDs must migrate atomically and auditably
The system SHALL replace every existing non-canonical Rewards ID through one controlled database migration. The migration MUST retain a one-to-one old-to-new mapping, MUST update local dependent Rewards ID copies in the same transaction, MUST preserve all customer, authentication, validation, Rewards account, catalog, request, and points records, and MUST be reversible without reusing an identifier for a different customer.

#### Scenario: Migrate existing alphanumeric identifiers
- **WHEN** the numeric Rewards ID migration runs with existing `RWD-...` customer identifiers
- **THEN** every customer receives a unique canonical numeric identifier and the migration stores the corresponding previous and new values

#### Scenario: Preserve dependent local Bonda identity
- **WHEN** a migrated customer has a local Bonda affiliate provisioning record
- **THEN** the provisioning record receives the same new numeric Rewards ID within the migration transaction

#### Scenario: Preserve business records during migration
- **WHEN** existing Rewards IDs are migrated
- **THEN** no customer, login, validation, Rewards journey, point ledger, catalog, or coupon audit record is deleted or reassigned to another customer

#### Scenario: Roll back the migration
- **WHEN** operators downgrade the numeric Rewards ID migration before any former identifier is reassigned
- **THEN** the previous identifiers are restored from the mapping and dependent local copies remain consistent
