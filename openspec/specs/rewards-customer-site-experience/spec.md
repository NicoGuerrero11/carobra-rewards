# Rewards Customer Site Experience

## Purpose

Define the authenticated customer site's navigation, information hierarchy,
focused destinations, and responsive presentation of server-owned Rewards data.

## Requirements

### Requirement: Customer navigation must reflect focused destinations
The authenticated customer shell SHALL present stable destinations for Inicio,
Beneficios, Cursos, Productos, and Actividad, while Cuenta remains available
from the account menu. The logo SHALL link to Inicio, and the notification
control SHALL expose the server-reported unread count when positive. Ayuda and
Notificaciones SHALL remain accessible as labeled utility controls. Every
authenticated customer, including an invited customer with pending, rejected,
cancelled, or attention-required validation, SHALL be able to open those
destinations without a validation-based redirect. Gift Cards MUST remain
reachable as a benefits subdestination but MUST NOT occupy a permanent top-level
navigation position while the customer catalog is unavailable. At narrow mobile
widths, the five primary product destinations SHALL appear in a labeled bottom
navigation.

#### Scenario: Customer navigates from Rewards home
- **WHEN** an authenticated customer opens the customer shell
- **THEN** the primary navigation exposes Inicio, Beneficios, Cursos, Productos, and Actividad without a separate top-level Gift Cards item

#### Scenario: Customer navigates on mobile
- **WHEN** an authenticated customer opens the shell at a supported narrow width
- **THEN** a fixed bottom navigation exposes the five primary product destinations with meaningful icons and visible text labels

#### Scenario: Customer returns through the logo
- **WHEN** the customer activates the Carobra logo from any authenticated destination
- **THEN** the site opens `/cliente/recompensas`

#### Scenario: Customer has unread notifications
- **WHEN** the portal reports one or more unread notifications
- **THEN** the notification control exposes the numeric unread count in visible text and an accessible label

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
The Rewards home SHALL prioritize the customer's current level and balance, the
next approved expiration when available, one primary action, current benefit
availability, understandable next-level progress, and a bounded recent-activity
summary. An invited customer SHALL receive a product-discovery action instead
of a passive membership label. The page MUST NOT calculate a monetary point
equivalence or repeat full product, activity, history, help, and benefits-detail
modules without an approved server rule.

#### Scenario: Active customer opens Rewards home
- **WHEN** an active customer has level, balance, action, product, timeline, and expiration data
- **THEN** the home presents the concise decision summary, the server-reported expiration, and links to focused destinations for additional detail

#### Scenario: Invited customer opens Rewards home
- **WHEN** an invited customer is waiting for product validation
- **THEN** the home preserves visible account state and presents Productos as the next useful commercial destination without inventing credited points

#### Scenario: Monetary equivalence is unavailable
- **WHEN** the portal does not return an approved point-to-currency value
- **THEN** the home omits monetary equivalence instead of calculating one in the frontend

### Requirement: Customer pages must preserve truthful server-owned state
The redesigned pages SHALL derive journey, points, products, actions, movements,
timeline, learning, and benefit availability from the authenticated V2 portal
projection. They MUST NOT use browser storage or frontend fixtures as business
authority.

#### Scenario: Portal state is unavailable
- **WHEN** the authenticated V2 portal projection cannot be loaded
- **THEN** the affected page presents a safe unavailable state and does not fabricate customer data

### Requirement: Course and product information must use focused destinations
The site SHALL provide a Cursos destination that truthfully communicates its
Próximamente state without inventing course inventory, progress, or rewards.
The Productos destination SHALL provide existing product status, level impact,
customer-safe guidance, commercial discovery, and advisor contact. It SHALL keep
advisor contact visible before the product grid at supported desktop widths and
reserve product-specific colors consistently. Product reward messaging MUST be
described as subject to confirmation unless the portal returns an approved
value. These pages MUST NOT promise unapproved points, renewals,
recommendations, course availability, or product availability.

#### Scenario: Customer opens Cursos
- **WHEN** the customer follows the Cursos destination before a course catalog is approved
- **THEN** the page presents a prominent Próximamente state without fabricated items or actions

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

### Requirement: Customer color communicates fixed meaning
The authenticated Rewards experience SHALL reserve the branded gradient for the
customer level block on Inicio. Other destination heroes and content surfaces
SHALL use clear neutral backgrounds. Gold SHALL indicate points or rewards,
navy SHALL indicate primary action, green SHALL indicate currently available or
completed state, gray SHALL indicate future or unavailable state, and red SHALL
indicate urgent expiration or error. Every state MUST also include visible text
independent of color.

#### Scenario: Customer compares screens
- **WHEN** the customer moves between Inicio, Cursos, Productos, and Beneficios
- **THEN** the same semantic meaning uses the same color family and only the Inicio level block uses the branded gradient
