## ADDED Requirements

### Requirement: Product discovery comes before account administration
Productos SHALL present compact Skandia, Quálitas and Modalidad 40 cards before linked-product information. Cards SHALL emphasize the brand/logo, an aspirational headline and brief customer-facing value without an advisor preparation checklist. Carobra navigation and primary-action styling SHALL remain intact.

#### Scenario: Customer explores products
- **WHEN** an authenticated customer opens Productos
- **THEN** all three offers precede a compact Mis productos section and there are no repeated large status banners, unapproved reward amounts, generic Rewards promotional block or explore-benefits action in the page content

### Requirement: Confirmed reward amounts are presentation-only
The product cards SHALL show +600 puntos Rewards for Skandia, +150 puntos Rewards for Quálitas and +600 puntos Rewards for Modalidad 40 in compact labels above their contact links. These owner-confirmed display amounts MUST NOT activate reward issuance, change a balance or level, or imply that contacting the advisor awards points. The page MUST NOT assert unconfirmed timing or crediting conditions.

#### Scenario: Customer views a product incentive
- **WHEN** the customer views one of the three product cards
- **THEN** its exact confirmed amount is visible above the existing contact link without adding an award action or replacing the compact catalog layout

### Requirement: Direct and truthful product contact
Each card SHALL offer a keyboard-accessible, goal-specific contact link: Quiero empezar a ahorrar for Skandia, Quiero proteger mi auto for Quálitas, and Quiero planear mi retiro for Modalidad 40. The existing advisor email and corresponding product subject SHALL remain unchanged and the email destination SHALL be indicated. The page MUST NOT open an instructional product dialog or imply that following a link creates a product, lead record or level change.

#### Scenario: Customer expresses interest
- **WHEN** a customer selects the goal-specific contact action for a product
- **THEN** the contact link identifies that product and uses the configured email path without submitting or activating a product

#### Scenario: Customer uses the closing invitation
- **WHEN** a customer reaches the page footer
- **THEN** it shows Hablemos de lo que quieres lograr, Da el siguiente paso con el equipo Carobra, and Contactar a un asesor using the existing email path without an unverified advisor identity or a new contact channel

### Requirement: Account status and responsive behavior remain intact
The page SHALL preserve real linked-product status, guidance and level impact and present distinct empty and unavailable states. All content SHALL remain usable at widths of 320 pixels and wider. Public offer discovery SHALL remain visible if the account data request fails.

#### Scenario: Account service unavailable
- **WHEN** portal data is unavailable for an authenticated customer
- **THEN** the commercial catalog remains visible and Mis productos reports a loading failure without inventing products

#### Scenario: Narrow screen
- **WHEN** a customer uses a 320-pixel viewport
- **THEN** panel visuals and copy stack with a visible contact link and no horizontal overflow

#### Scenario: Compact desktop catalog
- **WHEN** a customer opens Productos on a desktop viewport of at least 1000 pixels
- **THEN** the three offers occupy one row with shallow branded headers, readable untruncated copy and aligned contact actions, rather than three large full-width panels
