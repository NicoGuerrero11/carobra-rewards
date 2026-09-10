## ADDED Requirements

### Requirement: Free Bonda coupon availability must be independent from point redemption
Rewards V2 SHALL expose free Bonda coupon availability through an independent feature state. Enabling coupons MUST NOT enable point-priced redemption, gift cards, point expiry, or the Bonda points API, and disabling point redemption MUST NOT by itself hide approved free coupons from an otherwise eligible Bronce-or-higher customer.

#### Scenario: Enable coupons while gift cards remain disabled
- **WHEN** the Bonda coupon feature is approved and the point-redemption feature remains disabled
- **THEN** eligible customers can view and request approved free coupons while gift cards and point redemption remain unavailable

#### Scenario: Read coupon availability with a point balance
- **WHEN** two customers at the same level have different point balances
- **THEN** they receive the same level-approved coupon access because points do not control free coupons

### Requirement: Canonical level must control customer coupon access
The coupon application SHALL read the current level and journey state from the canonical Rewards V2 projection. It MUST NOT recalculate a level from points, frontend state, affiliate attributes, or Bonda segmentation.

#### Scenario: Customer spends points elsewhere
- **WHEN** a future point transaction changes a customer's balance without changing the canonical level
- **THEN** their approved free coupon set remains unchanged

#### Scenario: Canonical level changes
- **WHEN** a confirmed business event changes the customer's canonical V2 level
- **THEN** the next coupon response applies the cumulative access policy for the new level
