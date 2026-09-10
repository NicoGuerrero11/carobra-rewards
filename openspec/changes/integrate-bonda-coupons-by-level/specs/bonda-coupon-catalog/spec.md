## ADDED Requirements

### Requirement: Carobra must curate Bonda coupons by stable identifier and minimum level
Each published Bonda coupon SHALL have an enabled, effective Carobra catalog policy containing its stable Bonda coupon identifier, minimum Rewards level, cumulative-access rule, and display order. An item returned by Bonda without an approved Carobra policy MUST NOT appear to customers.

#### Scenario: Bonda returns an unapproved coupon
- **WHEN** the live Bonda catalog includes a coupon whose identifier has no enabled Carobra policy
- **THEN** the customer catalog omits that coupon

#### Scenario: Approved coupon disappears from Bonda
- **WHEN** an enabled Carobra policy references a coupon absent from the current Bonda catalog
- **THEN** the customer catalog omits it and the reconciliation report flags it for the catalog owner

#### Scenario: Presentation brand is missing or has several offers
- **WHEN** reconciliation finds no exact Bonda identifier or more than one current offer for a proposed presentation brand
- **THEN** every candidate remains disabled until the catalog owner approves one exact identifier or replaces the proposed benefit

### Requirement: Coupon access must be cumulative by canonical V2 level
The system SHALL use the canonical Carobra V2 level and the ordered ranks Bronce, Plata, Oro, Platino, and Titanio to determine coupon access. A level SHALL include its own coupons and every coupon assigned to a lower level. Points balance and Bonda segmentation MUST NOT affect this calculation.

#### Scenario: Plata customer opens the catalog
- **WHEN** a customer whose canonical level is Plata requests coupons
- **THEN** the response contains approved Bronce and Plata coupons and excludes Oro, Platino, and Titanio coupons

#### Scenario: Titanio customer opens the catalog
- **WHEN** a customer whose canonical level is Titanio requests coupons
- **THEN** the response contains every currently approved coupon from Bronce through Titanio

### Requirement: Invitado and non-active journeys must not receive coupons in this phase
The system SHALL return no available coupons or coupon-code actions to Invitado, Inactive, or Blocked journeys. The response SHALL explain the Carobra-owned availability state without exposing Bonda internals.

#### Scenario: Invitado opens benefits
- **WHEN** a registered customer without a current Rewards level opens the benefits page
- **THEN** the page shows no coupons or discounts and does not imply that points or product validation failed

#### Scenario: Inactive customer calls the coupon API directly
- **WHEN** an authenticated customer with an inactive journey requests a coupon code
- **THEN** the site backend rejects the request regardless of what Bonda would return

### Requirement: Customer coupon contracts must normalize live Bonda content
The site backend SHALL paginate Bonda catalog results, intersect them with Carobra policy, and return a stable customer contract containing only the required identifier, name, discount, safe description, safe usage instructions, safe legal terms, expiration, approved image URLs, category, usage channels, minimum level, and availability. It MUST NOT expose credentials, raw HTML, raw Bonda payloads, or partner implementation details.

#### Scenario: Bonda returns HTML content
- **WHEN** a coupon contains HTML descriptions or legal text
- **THEN** the customer response contains safe normalized text and no executable markup

#### Scenario: Bonda returns an error inside HTTP 200
- **WHEN** the partner responds with a successful HTTP status and an error payload
- **THEN** the adapter maps it to a stable Carobra error rather than treating it as coupon data

### Requirement: Customers must request coupon codes through Carobra
An authenticated eligible customer SHALL be able to request a code for an approved coupon available to their current level. The site backend SHALL revalidate level access and current catalog availability before calling Bonda and SHALL return a normalized code or instruction result.

#### Scenario: Request an available coupon
- **WHEN** an active Bronce-or-higher customer requests a coupon allowed for their level and Bonda returns success
- **THEN** Carobra records the request and returns the safe code and usage instructions without changing points

#### Scenario: Request a coupon from a higher level
- **WHEN** a customer's level rank is below the coupon's configured minimum level
- **THEN** Carobra rejects the request without calling Bonda

### Requirement: Coupon use must never modify the points ledger
Listing, opening, requesting, or receiving a coupon SHALL NOT reserve, debit, refund, or award points in this phase. The system MUST NOT route Bonda coupons through point-redemption commands.

#### Scenario: Complete a coupon-code request
- **WHEN** Bonda successfully returns a coupon code
- **THEN** the customer's available and reserved point balances remain unchanged

### Requirement: Ambiguous code requests must not be blindly retried
The system SHALL audit every coupon-code request with a local identifier. If the partner outcome is unknown after dispatch, the system SHALL mark it for verification and MUST NOT automatically create a second code request until received-coupon history or an operator confirms the outcome.

#### Scenario: Connection times out after dispatch
- **WHEN** the Bonda code request times out after the request may have reached the partner
- **THEN** Carobra records a verification-required outcome and does not automatically resend it

#### Scenario: Reconcile received history
- **WHEN** Bonda received-coupon history contains a result corresponding to a verification-required request
- **THEN** Carobra updates the local request to the matching final safe state

### Requirement: The benefits UI must represent live and degraded states truthfully
The frontend SHALL render the normalized level-filtered catalog with responsive cards, detail, code confirmation, and recent-coupon history. It SHALL provide accessible loading, empty, affiliate-pending, partner-unavailable, limit, inventory, and verification states while keeping gift cards separate and unavailable.

#### Scenario: Affiliate provisioning is pending
- **WHEN** an eligible customer opens benefits before Bonda affiliation becomes active
- **THEN** the page can show the approved catalog preview but disables code requests with a temporary activation message

#### Scenario: Bonda is temporarily unavailable
- **WHEN** no valid catalog response can be obtained
- **THEN** the page shows a retryable unavailable state and does not fabricate brands, discounts, codes, or expiration dates
