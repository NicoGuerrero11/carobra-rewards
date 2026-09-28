## MODIFIED Requirements

### Requirement: API must remain the identity and SISCA validation authority
The API SHALL own customer authentication rules, password hashing, session
authority, customer registration, customer persistence, consent persistence,
Rewards ID creation, SISCA validation creation, and the Neon transactions that
support those concerns. It SHALL expose only safe authenticated identity and
SISCA validation evidence required by the site backend. The API MUST NOT own
the V2 levels, profile activity, product-provider normalization beyond SISCA,
or frontend test scenarios.

#### Scenario: Registration business rules live in API
- **WHEN** the site submits a customer registration request
- **THEN** the API performs the business validation and persistence transaction that creates the customer and SISCA validation

#### Scenario: Site backend does not create customers directly
- **WHEN** the site backend receives a registration request
- **THEN** it calls the API instead of writing customer, consent, or SISCA validation records directly

### Requirement: Site backend must own V2 Rewards domain while brokering identity
The site backend SHALL provide web-facing routes, call the API for identity and
safe SISCA evidence, and own the V2 Rewards domain APIs, configuration,
test-mode controls, and associated database writes. It MUST NOT create an
independent customer identity, session authority, or raw SISCA interpretation.

#### Scenario: Site backend adapts an API error
- **WHEN** the API rejects a registration request with a duplicate email or CURP
- **THEN** the site backend returns a stable form error suitable for the site frontend without changing the business outcome

#### Scenario: Site backend evaluates a V2 journey
- **WHEN** accepted product evidence or profile activity reaches the site backend
- **THEN** it applies the V2 Rewards rules without writing authentication or raw SISCA records
