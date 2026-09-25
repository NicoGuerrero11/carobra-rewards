# Rewards V2 Canonical Runtime

## Purpose

Define Rewards V2 as the sole customer-facing and award-processing runtime.

## Requirements

### Requirement: Rewards V2 must be the only runtime model
The system SHALL execute Rewards V2 for every customer registration, SISCA
transition, rewards summary, and customer portal request. The system MUST NOT
expose a feature flag, request option, or automatic fallback that selects
Rewards V1.

#### Scenario: Register in any deployed environment
- **WHEN** a customer completes registration in UAT or production
- **THEN** the system creates the V2 invited journey without consulting an
  optional V2 activation flag

#### Scenario: V2 projection is missing
- **WHEN** an authenticated customer requests Rewards and no V2 journey exists
- **THEN** the system returns an observable migration or unavailable outcome and
  does not read V1 as a fallback

### Requirement: Customer-facing rewards contracts must be V2-only
The site backend and frontend SHALL use the authenticated V2 journey and portal
contracts as the sole source of rewards status, level, balance, eligibility, and
next actions. Legacy V1 account and eligibility routes MUST NOT be exposed as
supported customer-facing operations.

#### Scenario: Open the rewards portal
- **WHEN** an authenticated customer opens their rewards page
- **THEN** every displayed rewards value comes from the V2 journey or portal
  response

#### Scenario: Call a retired V1 route
- **WHEN** a browser client requests the retired V1 rewards account or
  eligibility route
- **THEN** the site returns not found and does not disclose a legacy balance

### Requirement: V2 point rules must be the only active award rules
The system SHALL disable V1 award rules for new issuance and SHALL use enabled,
versioned V2 rules for invited registration and product activation awards.
Replaying the same business event MUST remain idempotent.

#### Scenario: Issue registration points
- **WHEN** a new customer registration is committed
- **THEN** the system issues exactly one award using the active V2
  invited-registration rule

#### Scenario: Replay a registration event
- **WHEN** the V2 registration activation is processed again for the same
  customer
- **THEN** no duplicate registration award is created

### Requirement: Read-only Bonda coupon availability must be independent from point redemption
Rewards V2 SHALL expose read-only free Bonda coupon availability through an
independent feature state. Enabling catalog reads MUST NOT enable affiliate
provisioning, coupon issuance, received history, point-priced redemption, gift
cards, point expiry, or the Bonda points API. Disabling point redemption MUST
NOT by itself hide approved free coupons from an otherwise eligible
Bronce-or-higher customer.

#### Scenario: Enable coupons while gift cards remain disabled
- **WHEN** the Bonda coupon feature is approved and the point-redemption feature remains disabled
- **THEN** eligible customers can view approved free coupons while all Bonda writes, gift cards, and point redemption remain unavailable

#### Scenario: Read coupon availability with a point balance
- **WHEN** two customers at the same level have different point balances
- **THEN** they receive the same level-approved coupon access because points do not control free coupons

### Requirement: Canonical level must control customer coupon access
The coupon application SHALL read the current level and journey state from the
canonical Rewards V2 projection. It MUST NOT recalculate a level from points,
frontend state, affiliate attributes, or Bonda segmentation.

#### Scenario: Customer spends points elsewhere
- **WHEN** a future point transaction changes a customer's balance without changing the canonical level
- **THEN** their approved free coupon set remains unchanged

#### Scenario: Canonical level changes
- **WHEN** a confirmed business event changes the customer's canonical V2 level
- **THEN** the next coupon response applies the cumulative access policy for the new level
