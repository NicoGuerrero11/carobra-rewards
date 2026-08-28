# Rewards Customer Site Experience

## Purpose

Define the authenticated customer site's navigation, information hierarchy,
focused destinations, and responsive presentation of server-owned Rewards data.

## Requirements

### Requirement: Customer navigation must reflect focused destinations
The authenticated customer shell SHALL present stable destinations for Inicio,
Beneficios, Ganar puntos, Productos, and Actividad, while Cuenta remains
available from the account menu. Every authenticated customer, including an
invited customer with pending, rejected, cancelled, or attention-required
validation, SHALL be able to open those destinations without a validation-based
redirect. Gift Cards MUST remain reachable as a benefits subdestination but
MUST NOT occupy a permanent top-level navigation position while the customer
catalog is unavailable.

#### Scenario: Customer navigates from Rewards home
- **WHEN** an authenticated customer opens the customer shell
- **THEN** the primary navigation exposes Inicio, Beneficios, Ganar puntos, Productos, and Actividad without a separate top-level Gift Cards item

#### Scenario: Invited customer moves between sections
- **WHEN** an invited customer follows each primary navigation destination
- **THEN** every destination loads its customer-safe invited experience without redirecting to Inicio or a validation-only page

#### Scenario: Customer follows an existing Gift Card deep link
- **WHEN** an authenticated customer opens the existing Gift Card route directly
- **THEN** the route remains customer-safe and provides navigation back to Benefits

### Requirement: Eligibility restrictions must apply to actions instead of informational routes
The customer site SHALL use authentication to protect customer routes and SHALL
apply validation, product, catalog, balance, and redemption eligibility at the
specific action or API boundary. It MUST NOT deny access to an informational
customer destination solely because the customer is not yet active or validated.

#### Scenario: Invited customer browses unavailable capabilities
- **WHEN** an invited customer opens benefits, earning, product, activity, or rewards information
- **THEN** the site loads the destination and truthfully marks unavailable actions without redirecting the customer

#### Scenario: Invited customer attempts redemption
- **WHEN** an invited customer attempts a product-dependent or redemption action
- **THEN** the server rejects or withholds that action according to eligibility while preserving access to the surrounding destination

### Requirement: Rewards home must prioritize current decisions
The Rewards home SHALL prioritize the customer's current level and balance, one
primary action, current benefit availability, next-level progress, and a bounded
recent-activity summary. It MUST NOT repeat full product, activity, history,
help, and benefits-detail modules that have focused destinations.

#### Scenario: Active customer opens Rewards home
- **WHEN** an active customer has level, balance, action, product, and timeline data
- **THEN** the home presents the concise decision summary and links to focused destinations for additional detail

#### Scenario: Invited customer opens Rewards home
- **WHEN** an invited customer is waiting for product validation
- **THEN** the home preserves the validation explanation, visible balance, and one truthful next action without exposing unavailable catalog claims

### Requirement: Customer pages must preserve truthful server-owned state
The redesigned pages SHALL derive journey, points, products, actions, movements,
timeline, learning, and benefit availability from the authenticated V2 portal
projection. They MUST NOT use browser storage or frontend fixtures as business
authority.

#### Scenario: Portal state is unavailable
- **WHEN** the authenticated V2 portal projection cannot be loaded
- **THEN** the affected page presents a safe unavailable state and does not fabricate customer data

### Requirement: Earning and product information must use focused destinations
The site SHALL provide a Ganar puntos destination for existing profile activity,
permanence, product-linked earning explanations, and renewal readiness, and a
Productos destination for existing product status, level impact, customer-safe
guidance, and advisor contact. These pages MUST NOT promise unapproved points,
renewals, recommendations, or product availability.

#### Scenario: Customer opens Ganar puntos
- **WHEN** the portal contains profile progress, actions, or product-linked movement data
- **THEN** Ganar puntos organizes the available evidence and marks unresolved earning rules without inventing values

#### Scenario: Customer opens Productos
- **WHEN** the portal contains active, pending, cancelled, or ended product facts
- **THEN** Productos presents customer-safe status and level impact with an advisor contact path and no provider evidence

### Requirement: Productos must support commercial discovery
The Productos destination SHALL distinguish products already linked to the
authenticated customer from the MVP commercial offer. The offer SHALL present
Skandia, Quálitas, and Modalidad 40 with customer-safe introductory copy and an
advisor-contact action that identifies the selected option. It MUST NOT imply
automatic eligibility, pricing, approval, or online contracting.

#### Scenario: Customer explores an MVP product
- **WHEN** the customer selects Skandia, Quálitas, or Modalidad 40 from Productos
- **THEN** the site opens an advisor-contact path with the selected product context and does not create or activate a product

### Requirement: Focused pages must remain responsive and accessible
The redesigned customer pages SHALL preserve semantic headings, keyboard-usable
navigation, visible status text independent of color, and layouts without
horizontal overflow at supported desktop and 320-pixel-or-wider mobile widths.

#### Scenario: Customer uses a narrow mobile viewport
- **WHEN** the customer opens Home, Benefits, Activity, or Gift Cards at 320 pixels wide
- **THEN** navigation and content reflow without clipped actions, hidden essential text, or horizontal scrolling
