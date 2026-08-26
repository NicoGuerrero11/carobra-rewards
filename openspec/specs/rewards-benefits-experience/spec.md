# Rewards Benefits Experience

## Purpose

Define a truthful and useful customer benefits experience while catalog and
redemption capabilities are introduced progressively.

## Requirements

### Requirement: Benefits must remain useful without an enabled catalog
The Benefits destination SHALL distinguish benefits available now, experiences
that are being prepared, and experiences gated by existing customer or module
state. It MUST NOT invent brands, point prices, inventory, validity, or
eligibility that the authenticated portal does not provide.

#### Scenario: Benefits catalog is disabled
- **WHEN** an authenticated customer opens Benefits while the catalog module is disabled
- **THEN** the page explains the available benefit families and preparation state without presenting redeemable items or invented commercial terms

#### Scenario: Benefits data becomes available
- **WHEN** the portal returns approved benefit items
- **THEN** the page renders only those server-provided items and their customer-safe availability

### Requirement: Gift Cards must be a nested benefits experience
The Benefits destination SHALL provide the entry point to Gift Cards. The Gift
Card page SHALL describe its current server-reported availability, retain the
customer's relevant balance or prerequisite context, and provide a clear return
to Benefits.

#### Scenario: Customer without available Gift Cards explores the category
- **WHEN** the customer follows Gift Cards from Benefits while the module is unavailable
- **THEN** the Gift Card page explains the gated state without offering a redemption control

### Requirement: Benefit calls to action must lead somewhere useful
Every prominent Benefits call to action SHALL lead to an available focused
destination or a customer-safe explanation. The page MUST NOT present a primary
action that ends at an equivalent empty holding state with no next step.

#### Scenario: No redemption action is available
- **WHEN** the customer has no enabled catalog or redemption action
- **THEN** Benefits offers useful navigation to Rewards progress, learning, or the Gift Card explanation instead of a disabled redemption button
