## ADDED Requirements

### Requirement: Carobra must curate Bonda coupons by stable identifier and minimum level
Each published Bonda coupon SHALL have an enabled, effective Carobra catalog policy containing its stable Bonda coupon identifier, minimum Rewards level, cumulative-access rule, and display order. An item returned by Bonda without an approved Carobra policy MUST NOT appear to customers.

#### Scenario: Bonda returns an unapproved coupon
- **WHEN** the live Bonda catalog includes a coupon whose identifier has no enabled Carobra policy
- **THEN** the customer catalog omits that coupon

#### Scenario: Approved coupon disappears from Bonda
- **WHEN** an enabled Carobra policy references a coupon absent from current Bonda content
- **THEN** the customer catalog omits it and reconciliation flags it for the catalog owner

#### Scenario: Presentation brand is missing or has several offers
- **WHEN** reconciliation finds no exact Bonda identifier or more than one current offer for a proposed presentation brand
- **THEN** every candidate remains disabled until the catalog owner approves exact identifiers or replaces the proposed benefit

### Requirement: Coupon access must be cumulative by canonical V2 level
The system SHALL use the canonical Carobra V2 level and the ordered ranks Bronce, Plata, Oro, Platino, and Titanio to determine coupon visibility. A level SHALL include its own coupons and every coupon assigned to a lower level. Points balance and Bonda segmentation MUST NOT affect this calculation.

#### Scenario: Plata customer opens the catalog
- **WHEN** an active customer whose canonical level is Plata requests coupons
- **THEN** the response contains approved Bronce and Plata coupons and excludes Oro, Platino, and Titanio coupons

#### Scenario: Titanio customer opens the catalog
- **WHEN** an active customer whose canonical level is Titanio requests coupons
- **THEN** the response contains every currently approved coupon from Bronce through Titanio

### Requirement: Invitado and non-active journeys must not receive coupons in this phase
The system SHALL return no available coupons to Invitado, Inactive, or Blocked journeys. The response SHALL explain the Carobra-owned availability state without exposing Bonda internals.

#### Scenario: Invitado opens benefits
- **WHEN** a registered customer without a current Rewards level opens the benefits page
- **THEN** the page shows no coupons or discounts and does not imply that points or product validation failed

#### Scenario: Inactive customer calls the catalog API directly
- **WHEN** an authenticated customer with an inactive journey requests the coupon catalog
- **THEN** the site backend returns no available coupons regardless of what Bonda would return

### Requirement: Customer coupon contracts must normalize live Bonda content
The site backend SHALL read only approved Bonda identifiers, intersect them with Carobra policy, and return a stable customer contract containing only the required identifier, name, discount, safe description, safe usage instructions, safe legal terms, expiration, approved image URLs, category, usage channels, minimum level, availability, and optional normalized branch or brand content. It MUST NOT expose credentials, raw HTML, raw Bonda payloads, or partner implementation details.

#### Scenario: Bonda returns HTML content
- **WHEN** a coupon contains HTML descriptions or legal text
- **THEN** the customer response contains safe normalized text and no executable markup

#### Scenario: Bonda returns an error inside HTTP 200
- **WHEN** the partner responds with a successful HTTP status and an error payload
- **THEN** the adapter maps it to a stable Carobra error rather than treating it as coupon data

### Requirement: The Bonda customer experience must remain read-only
Catalog listing, coupon detail, images, brand content, and branch exploration SHALL be the only Bonda operations exposed by this change. The system MUST NOT provision affiliates, generate coupon codes, read received-coupon history, or perform any other external Bonda write. Browsing SHALL NOT reserve, debit, refund, or award points.

#### Scenario: Eligible customer reviews a benefit
- **WHEN** an active Bronce-or-higher customer opens an approved coupon and its branches
- **THEN** Carobra performs only authenticated read operations and leaves customer identity and point balances unchanged

#### Scenario: Write-side configuration is present
- **WHEN** catalog reading is enabled while affiliate provisioning or coupon-request configuration exists
- **THEN** the customer catalog remains read-only and does not invoke those capabilities

### Requirement: The benefits UI must represent live and degraded states truthfully
The frontend SHALL render the normalized level-filtered catalog as one flat responsive grid with one card per approved Bonda coupon identifier, Carobra-owned category filters, and dedicated full-page detail. It MUST NOT divide eligible cards into level sections, distinguish inherited benefits, or present code-generation/history controls. It SHALL provide accessible loading, empty, and partner-unavailable states while keeping gift cards separate and unavailable.

#### Scenario: Customer moves to a higher level
- **WHEN** the customer's canonical level grants additional approved coupons
- **THEN** those coupons join the same catalog grid without level headings, origin badges, or inherited-benefit sections

#### Scenario: One brand has several distinct Bonda coupons
- **WHEN** two or more approved identifiers share a brand but have different offers
- **THEN** the catalog renders a separate card for every identifier and distinguishes each by discount and summary

#### Scenario: One coupon contains several included advantages
- **WHEN** one approved coupon description contains several formats, products, or discount tiers
- **THEN** the catalog renders one card for that identifier and its detail preserves the complete normalized description

#### Scenario: Customer scans the catalog
- **WHEN** eligible benefits render on desktop or mobile
- **THEN** each fully clickable card preserves the principal image and overlaid logo, reserves separation before the offer, omits the duplicate visible brand heading while retaining an accessible name, clamps the summary, and adapts columns without losing essential information

#### Scenario: Customer enters the benefits page
- **WHEN** the catalog is available
- **THEN** the available-benefits count is the primary heading and no redundant page, level, product-status, points hero, or unrelated Otras experiencias block appears before or after the offers

#### Scenario: Customer opens a coupon card
- **WHEN** an eligible customer selects a card
- **THEN** the site navigates to a stable Carobra detail route with its complete safe description, instructions, channels, expiration, legal terms, and optional branch or brand information

#### Scenario: Customer reads long benefit copy
- **WHEN** normalized content contains percentages, important notices, contact details, numbered steps, validity, or restrictions
- **THEN** the page preserves source wording and uses semantic spacing, step markers, bold weight, and restrained Carobra color for actionable information

#### Scenario: Customer opens catalog or detail
- **WHEN** the approved set is a small subset of the Bonda microsite
- **THEN** Carobra reads and caches only approved identifiers and does not block core detail on branches or map code

#### Scenario: Bonda provides only one approved image
- **WHEN** detail contains one approved image and no verified gallery
- **THEN** the page renders a static hero without inactive or fabricated carousel controls

#### Scenario: Bonda provides distinct image roles
- **WHEN** Bonda returns principal, thumbnail, and landscape images
- **THEN** the normalized contract preserves approved HTTPS variants separately

#### Scenario: Technical affiliate supplies read-only content
- **WHEN** the technical affiliate `990910001` is configured for catalog access
- **THEN** Carobra uses it only for catalog, detail, image, brand, and branch reads and never as the customer's identity

#### Scenario: Bonda is temporarily unavailable
- **WHEN** no valid cached or current catalog response can be obtained
- **THEN** the page shows a retryable unavailable state and does not fabricate brands, discounts, images, expiration, or branches

### Requirement: Optional partner detail must remain safe and truthful
The site backend SHALL expose normalized branch availability and brand information only when Bonda supplies it for an approved coupon. The frontend MUST omit unavailable sections and MUST select related benefits only from the customer's currently eligible Carobra catalog.

#### Scenario: Branch and brand information is available
- **WHEN** Bonda returns approved branch records or a brand description
- **THEN** detail can show `Sucursales disponibles` and `Sobre la marca` using normalized safe content

#### Scenario: Customer explores enabled branches
- **WHEN** an approved coupon provides branches and optional valid coordinates
- **THEN** detail opens a compact accessible modal with a bounded map and scrollable list, keeps branches without coordinates visible, supports keyboard dismissal, and stacks the map above the list on small screens

#### Scenario: Related benefits are displayed
- **WHEN** the selected coupon shares a category with other currently eligible approved coupons
- **THEN** detail shows them as image-and-logo cards without exposing higher-level or unapproved items
