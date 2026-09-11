## MODIFIED Requirements

### Requirement: Benefits must remain useful without an enabled catalog
The Benefits destination SHALL distinguish benefits available now, experiences that are being prepared, and experiences gated by existing customer or module state. When a first product is required, the page SHALL explain that prerequisite and link directly to Productos. The page MAY preview proposed catalog brand names and category counts in a clearly marked upcoming mode, but MUST NOT present those previews as redeemable inventory. It MUST NOT invent point prices, stock, validity, or eligibility that the authenticated portal does not provide.

#### Scenario: Benefits catalog is disabled
- **WHEN** an authenticated customer opens Benefits while the catalog module is disabled
- **THEN** the page explains the product prerequisite, provides a direct Productos action, and marks any brand preview as Próximamente

#### Scenario: Benefits data becomes available
- **WHEN** the portal returns approved benefit items
- **THEN** the page renders only those server-provided items and their customer-safe availability

### Requirement: Benefit calls to action must lead somewhere useful
Every prominent Benefits call to action SHALL lead to an available focused destination or a customer-safe explanation. A locked category SHALL explain what unlocks it and provide the relevant action when one exists. The page MUST NOT present a primary action that ends at an equivalent empty holding state with no next step.

#### Scenario: No redemption action is available
- **WHEN** the customer has no enabled catalog or redemption action
- **THEN** Benefits offers useful navigation to Productos, Rewards progress, learning, or the Gift Card explanation instead of a disabled redemption button
