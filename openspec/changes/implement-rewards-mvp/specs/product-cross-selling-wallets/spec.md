## ADDED Requirements

### Requirement: Cross-selling products must use normalized replay-safe lifecycle events
The system SHALL model Skandia and Qualitas contracts independently from AFORE and accept authenticated, schema-valid contracting, activation, permanence, cancellation, and benefit-use evidence with stable external event identifiers.

#### Scenario: Replay a product activation event
- **WHEN** a configured partner delivers the same external product event more than once
- **THEN** the system applies the lifecycle transition and related rewards at most once

### Requirement: Qualifying Skandia contracting must award 5,000 points
When an enabled rule receives confirmed evidence that an eligible customer contracted a qualifying Skandia PPR or life product, the system SHALL issue 5,000 universal points exactly once per qualifying contract.

#### Scenario: Confirm a qualifying Skandia contract
- **WHEN** the configured Skandia source confirms a new eligible PPR or life contract
- **THEN** the system issues one 5,000-point cross-selling award linked to that contract

### Requirement: Product permanence must award 5,000 points after 12 active months
The system SHALL issue 5,000 points once when a qualifying Skandia or Qualitas policy remains active for 12 months. Cancellation before the milestone MUST prevent the permanence award.

#### Scenario: Qualifying policy reaches 12 months
- **WHEN** an eligible product contract remains active through its 12-month milestone
- **THEN** the system issues one 5,000-point permanence award

### Requirement: Restricted product value must remain separate from universal points
The system SHALL represent PPR contributions and Qualitas discounts as product-restricted wallet value containing decimal amount, currency, product, policy version, release condition, and lifecycle state. This value MUST NOT increase universal point balance, be redeemed through the catalog, or be represented as cash owed directly to the customer.

#### Scenario: Release a vested PPR benefit
- **WHEN** an enabled policy's active-product condition is satisfied
- **THEN** the system marks the configured customer share available for application to that customer's PPR and does not add points

### Requirement: Product cancellations and clawbacks must preserve audit history
The system SHALL apply configured vesting, freeze, reversal, and clawback rules through compensating wallet transitions without deleting the original product or benefit evidence.

#### Scenario: Product cancels before wallet vesting
- **WHEN** a product cancellation arrives before the configured 12-month release condition
- **THEN** the pending restricted value is frozen or cancelled according to the applied policy and no universal points are invented

### Requirement: Qualitas benefit activation must remain configuration-gated
The system SHALL support both an AFORE-plus-platform-activity eligibility policy and a multi-product wallet policy, but MUST enable only the version approved by the team. The discount or point value MUST remain disabled while undefined.

#### Scenario: Qualitas rule has no approved policy
- **WHEN** product evidence arrives before a Qualitas activation version and value are enabled
- **THEN** the system records safe evidence without exposing or granting an unapproved customer benefit

