# Site Application Architecture

## Purpose

Define the single-repository architecture and responsibility boundaries among
the API, site backend, and site frontend.

## Requirements

### Requirement: Repository must remain single-repo with separated application folders
The system SHALL keep API, site backend, and site frontend in one repository
while separating them into top-level `api`, `site-backend`, and `site-frontend`
folders. Each folder SHALL have clear runtime and ownership responsibilities.

#### Scenario: Inspect repository layout
- **WHEN** developers inspect the repository after the architecture change
- **THEN** the API code, site backend code, and site frontend code are separated
  into `api`, `site-backend`, and `site-frontend`

#### Scenario: Keep one source repository
- **WHEN** developers work on cross-application onboarding changes
- **THEN** they can update API, site backend, site frontend, and OpenSpec
  artifacts in the same repository

### Requirement: API must remain the business source of truth
The API SHALL own customer authentication rules, password hashing, session
authority, customer registration, customer persistence, consent persistence,
Rewards ID creation, SISCA validation creation, and Neon database transactions.
The site backend MUST NOT duplicate these business rules.

#### Scenario: Registration business rules live in API
- **WHEN** the site submits a customer registration request
- **THEN** the API performs the business validation and persistence transaction
  that creates the customer and SISCA validation

#### Scenario: Site backend does not create customers directly
- **WHEN** the site backend receives a registration request
- **THEN** it calls the API instead of writing customer, consent, or SISCA
  validation records directly

### Requirement: Site backend must act as a thin V2-only BFF
The site backend SHALL provide web-facing routes for the site, call the business
application, handle browser cookie ergonomics, and translate errors into stable
site-facing errors. For Rewards, it SHALL expose only the V2 journey and portal
contracts and MUST NOT offer V1 rewards account or eligibility routes as an
alternative.

#### Scenario: Site requests rewards state
- **WHEN** the frontend asks for the authenticated customer's rewards experience
- **THEN** the site backend returns the V2 journey or portal contract without
  consulting a V1 fallback

#### Scenario: Legacy rewards route is requested
- **WHEN** a browser requests a retired V1 rewards account or eligibility path
- **THEN** the site backend returns not found

#### Scenario: Site backend adapts an API error
- **WHEN** the API rejects a registration request with a duplicate email or CURP
- **THEN** the site backend returns a stable form error suitable for the site
  frontend without changing the business outcome

#### Scenario: Site backend preserves API session authority
- **WHEN** login succeeds through the site backend
- **THEN** the resulting browser session corresponds to API-authorized
  authentication and does not create an independent business identity

### Requirement: Site frontend must start from the demo Rewards frontend
The site frontend SHALL be initialized from the `frontend` application in
`NicoGuerrero11/demo-rewards` and then adapted to the real MVP onboarding and
login contract. Demo-only backend behavior, mock auth assumptions, and OAuth
links MUST be removed or disabled unless a later change adds them explicitly.

#### Scenario: Import demo frontend as visual base
- **WHEN** the site frontend is introduced
- **THEN** the landing, registration, login, layout, styles, and assets from the
  demo frontend are available as the starting site implementation

#### Scenario: Remove demo-only Google OAuth from MVP auth
- **WHEN** customers view registration or login in the MVP site
- **THEN** they are not offered Google OAuth as an enabled production auth path
  by this change

### Requirement: Frontend forms and rewards pages must call V2 site-backend contracts
The site frontend SHALL submit registration, login, logout, profile, and
validation-status requests through the site backend. Rewards pages SHALL consume
only V2 journey and portal contracts. Direct browser calls to the API and
fallback calls to V1 rewards contracts MUST NOT be required for the normal site
experience.

#### Scenario: Open Rewards with V2 state
- **WHEN** an authenticated customer opens the rewards page
- **THEN** the frontend renders points, level, eligibility, and actions
  exclusively from V2 responses

#### Scenario: V2 response is unavailable
- **WHEN** the V2 journey cannot be loaded
- **THEN** the frontend presents an unavailable or migration state and does not
  request V1 data

#### Scenario: Submit registration through site backend
- **WHEN** a customer submits the registration form from the site frontend
- **THEN** the frontend sends the request to the site backend, and the site
  backend calls the API

#### Scenario: Avoid browser-level API coupling
- **WHEN** API base URL, cookie domain, or CORS settings change
- **THEN** the site frontend does not need to encode business API details beyond
  its site backend endpoint contract

### Requirement: Customer contracts must enforce provider abstraction
The site backend SHALL translate internal product and validation evidence into
provider-neutral customer contracts. Customer-facing endpoints and pages MUST
NOT include provider, source, source ID, checkpoint, request ID, raw evidence,
or internal integration error fields.

#### Scenario: Customer portal serializes product detail
- **WHEN** the site backend returns product detail to an authenticated customer
- **THEN** the serialized response contains only customer-facing product type,
  status, dates, impact, and guidance

### Requirement: Internal and customer views must use separate projections
The system SHALL preserve detailed provider evidence for authorized operations
and audit views while exposing a separately validated customer projection.
Hiding a field in CSS or omitting it only in one page MUST NOT be treated as
sufficient redaction.

#### Scenario: Operations investigates a validation case
- **WHEN** an authorized operations user opens an internal case
- **THEN** internal evidence remains available according to authorization while
  the corresponding customer response remains provider-neutral
