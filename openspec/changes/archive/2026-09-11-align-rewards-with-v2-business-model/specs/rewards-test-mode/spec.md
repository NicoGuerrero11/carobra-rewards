## ADDED Requirements

### Requirement: Test scenarios must be server-owned and isolated
The system SHALL provide authorized internal test scenarios using test-only
identities and records isolated from real customer data. Scenario state MUST be
stored and evaluated by backend contracts, not browser storage.

#### Scenario: Reviewer opens a Bronze test scenario
- **WHEN** an authorized reviewer selects the Bronze scenario in an approved test environment
- **THEN** the site receives a backend-generated journey summary for that scenario

### Requirement: Test scenarios must cover the V2 journey states
The system SHALL provide reproducible scenarios for Invitado, pending SISCA
validation, Bronce, Plata, each product-count level enabled by configuration,
product cancellation, and reactivation.

#### Scenario: Reviewer tests a cancellation
- **WHEN** an authorized reviewer triggers the cancellation step in a test scenario
- **THEN** the backend applies the same product-fact and level-evaluation contract used by the site

### Requirement: Test controls must not be available to production customers
The system MUST require an explicit non-production environment allowance and
authorization for scenario creation or mutation. Production customer requests
MUST NOT receive scenario controls or test data.

#### Scenario: Production customer requests test controls
- **WHEN** a production customer or unauthenticated request asks for test scenario data
- **THEN** the system rejects the request without returning test information

