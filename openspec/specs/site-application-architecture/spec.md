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

### Requirement: Site backend must act as a thin BFF
The site backend SHALL provide web-facing routes for the site, call the API,
handle browser cookie ergonomics, and translate API errors into stable
site-facing errors. It MUST NOT own Rewards business state or direct database
writes.

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

### Requirement: Frontend forms must call the site backend rather than the API directly
The site frontend SHALL submit registration, login, logout, profile, and
validation-status requests to the site backend. Direct browser calls to the API
MUST NOT be required for the normal site experience.

#### Scenario: Submit registration through site backend
- **WHEN** a customer submits the registration form from the site frontend
- **THEN** the frontend sends the request to the site backend, and the site
  backend calls the API

#### Scenario: Avoid browser-level API coupling
- **WHEN** API base URL, cookie domain, or CORS settings change
- **THEN** the site frontend does not need to encode business API details beyond
  its site backend endpoint contract
