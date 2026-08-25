## ADDED Requirements

### Requirement: Catalog items must declare price, eligibility, inventory, and fulfillment behavior
Each catalog item SHALL be versioned and identify its mode, enabled state, availability interval, point price when applicable, eligibility rule, inventory mode, fulfillment mode, and partner dependency. Items lacking approved values or agreements MUST remain unavailable.

#### Scenario: Read an unavailable partner benefit
- **WHEN** a customer views a catalog item whose required partner agreement is not enabled
- **THEN** the system does not present the item as redeemable and returns a clear availability state

### Requirement: The catalog must support free entitlements and point rewards
The system SHALL distinguish automatic or free entitlements from point-priced rewards and restricted product benefits. Granting or consuming a free entitlement MUST NOT alter the universal point balance.

#### Scenario: Grant the onboarding cinema entitlement
- **WHEN** an eligible customer satisfies the configured onboarding entitlement rule and inventory is available
- **THEN** the system creates the entitlement without consuming points

### Requirement: Controlled inventory must prevent overselling
The system SHALL track available, reserved, fulfilled, and released units for controlled inventory and use transactional concurrency control when reserving a unit.

#### Scenario: Two customers request the last unit
- **WHEN** two eligible redemption requests concurrently target the final available unit
- **THEN** at most one reservation succeeds and inventory never becomes negative

### Requirement: Point redemption must be atomic
Creating a point redemption SHALL atomically validate eligibility, catalog availability, monthly limits, inventory, and available points; reserve inventory; allocate FIFO point lots; create ledger consumption; and persist the redemption. A failed validation MUST leave points and inventory unchanged.

#### Scenario: Redeem an available reward
- **WHEN** an eligible customer has sufficient points, available monthly capacity, and available inventory
- **THEN** the system creates one redemption, reserves inventory, and consumes the required points in one transaction

#### Scenario: Redeem with insufficient points
- **WHEN** the customer lacks the required available point balance
- **THEN** the system returns `insufficient_points` and changes neither inventory nor ledger

### Requirement: Monthly redemption limits must be configurable
The system SHALL enforce an effective-dated monthly limit policy by customer and configured scope. Until the team approves a value, point redemption SHALL remain disabled rather than use an invented limit.

#### Scenario: Reach the configured monthly limit
- **WHEN** a new redemption would exceed the applicable monthly policy
- **THEN** the system rejects it with `monthly_limit_reached` and preserves points and inventory

### Requirement: Redemption lifecycle must support fulfillment, cancellation, refund, and waitlist
The system SHALL preserve valid transitions among `PENDING`, `CONFIRMED`, `FULFILLED`, `CANCELLED`, `REFUNDED`, and `WAITLISTED` as allowed by item policy. Cancellation or failure SHALL release inventory and restore points through compensating ledger entries when the policy requires a refund.

#### Scenario: Cancel a refundable reserved redemption
- **WHEN** an authorized cancellation occurs before fulfillment under a refundable policy
- **THEN** the system releases the unit, records cancellation, and restores the allocated points without rewriting history

#### Scenario: Join a full high-value experience waitlist
- **WHEN** an eligible customer requests a waitlist-enabled item with no inventory
- **THEN** the system creates a waitlist position without consuming points until inventory is reserved

