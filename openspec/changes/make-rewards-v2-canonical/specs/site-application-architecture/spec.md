## MODIFIED Requirements

### Requirement: Site backend must act as a thin V2-only BFF
The site backend SHALL provide web-facing routes for the site, call the business application, handle browser cookie ergonomics, and translate errors into stable site-facing errors. For Rewards, it SHALL expose only the V2 journey and portal contracts and MUST NOT offer V1 rewards account or eligibility routes as an alternative.

#### Scenario: Site requests rewards state
- **WHEN** the frontend asks for the authenticated customer's rewards experience
- **THEN** the site backend returns the V2 journey or portal contract without consulting a V1 fallback

#### Scenario: Legacy rewards route is requested
- **WHEN** a browser requests a retired V1 rewards account or eligibility path
- **THEN** the site backend returns not found

### Requirement: Frontend forms and rewards pages must call V2 site-backend contracts
The site frontend SHALL submit registration, login, logout, profile, validation-status, and rewards requests through the site backend. Rewards pages SHALL consume only V2 journey and portal contracts. Direct browser calls to the API and fallback calls to V1 rewards contracts MUST NOT be required for the normal site experience.

#### Scenario: Open Rewards with V2 state
- **WHEN** an authenticated customer opens the rewards page
- **THEN** the frontend renders points, level, eligibility, and actions exclusively from V2 responses

#### Scenario: V2 response is unavailable
- **WHEN** the V2 journey cannot be loaded
- **THEN** the frontend presents an unavailable or migration state and does not request V1 data
