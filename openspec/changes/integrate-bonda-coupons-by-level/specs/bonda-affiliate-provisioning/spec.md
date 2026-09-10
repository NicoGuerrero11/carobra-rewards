## ADDED Requirements

### Requirement: Registration must provision a Rewards-ID-only Bonda affiliate
After a Carobra customer registration commits, the system SHALL provision the Bonda affiliate using the customer's Rewards ID as `code`. The request MUST set `send_welcome_email` to false and MUST NOT send email, name, CURP, phone, address, or other customer attributes.

#### Scenario: Provision a newly registered customer
- **WHEN** FastAPI commits a new customer with a Rewards ID and Bonda confirms the affiliate request
- **THEN** the site backend records the Bonda affiliation as active using only that Rewards ID

#### Scenario: Avoid Bonda communications
- **WHEN** the site backend creates or updates a Bonda affiliate
- **THEN** the partner request disables the welcome email and contains no customer communication fields

### Requirement: Bonda failure must not roll back Carobra registration
The system SHALL keep a valid Carobra registration successful when affiliate provisioning cannot complete. It SHALL persist or recover a pending provisioning state and retry without creating a second Carobra customer or Rewards ID.

#### Scenario: Bonda is unavailable after registration
- **WHEN** Carobra registration succeeds and the Bonda affiliate request times out or returns a retryable failure
- **THEN** registration remains successful and the affiliate state remains pending for a later retry

#### Scenario: Recover a missing provisioning record
- **WHEN** registration committed but the first provisioning-state write did not complete
- **THEN** a later authenticated benefits request or operations backfill recreates the pending state for the same customer and Rewards ID

### Requirement: Affiliate provisioning must be idempotent and observable
The system SHALL keep one current provisioning state per Carobra customer, SHALL treat a Bonda affiliate already associated with the same Rewards ID as success, and SHALL expose safe operational state without logging credentials or raw customer data.

#### Scenario: Retry an existing affiliate
- **WHEN** a pending provisioning attempt discovers that Bonda already has the same Rewards ID
- **THEN** the system records the affiliation as active without creating a duplicate

#### Scenario: Encounter a non-retryable partner failure
- **WHEN** Bonda rejects credentials or reports an affiliate identity conflict
- **THEN** the system records an action-required state with a safe reason code and stops automatic retries

#### Scenario: Bonda rejects the canonical Rewards ID format
- **WHEN** the configured Bonda microsite rejects the customer's canonical alphanumeric Rewards ID
- **THEN** the system records an action-required state and MUST NOT substitute a numeric alias, CURP, email, or other customer identifier

### Requirement: Live affiliate provisioning must be activation-gated
The system MUST NOT call the live Bonda affiliate API unless the environment is allowed, the integration flag is enabled, and the microsite identifier and affiliate token are configured.

#### Scenario: Token is unavailable
- **WHEN** the application starts without the Bonda affiliate token
- **THEN** customer registration continues normally and no live Bonda affiliate request is attempted

#### Scenario: Test environment is approved
- **WHEN** all test credentials and the test environment allowlist are configured
- **THEN** the system can provision designated test Rewards IDs without using real customer data
