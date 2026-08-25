## ADDED Requirements

### Requirement: Current Rewards projections must use a read-only fast path
The site backend SHALL determine whether the persisted V2 journey already represents the authenticated API evidence before opening a synchronization transaction. When the projection is current, the request MUST avoid journey mutation, row locks, idempotent award attempts, and projection timestamp updates.

#### Scenario: Repeated pending-customer navigation
- **WHEN** a pending customer with an existing invited journey and registration award requests Rewards repeatedly
- **THEN** each request reads the existing projection without entering the transactional synchronization path

#### Scenario: Repeated validated-customer navigation
- **WHEN** a validated customer has the matching active product event, product award, active journey, and calculated level
- **THEN** each request reads the existing projection without entering the transactional synchronization path

#### Scenario: Repair genuinely stale evidence
- **WHEN** authenticated API evidence is newer than or absent from the persisted Rewards projection
- **THEN** the site backend executes the existing idempotent transactional synchronization once and subsequent requests use the read-only fast path

### Requirement: Rewards dashboard must consume one complete portal projection
The customer portal response SHALL include the safe journey summary, activity details, and movement details already loaded to build the portal. The Rewards dashboard MUST render from one portal request and MUST NOT request journey, activities, or movements separately.

#### Scenario: Render authenticated Rewards dashboard
- **WHEN** an authenticated customer opens the Rewards dashboard
- **THEN** the frontend requests the portal projection once and renders journey, points, products, activities, movements, actions, and timeline from that response

#### Scenario: Preserve focused endpoint compatibility
- **WHEN** another authorized consumer requests journey, activities, or movements directly
- **THEN** the existing focused endpoint continues to return its established safe contract

### Requirement: Protected middleware must retrieve independent context concurrently
The site frontend SHALL retrieve the authenticated profile and validation status concurrently for protected routes while preserving API-owned session authority and existing redirects.

#### Scenario: Load a protected customer page
- **WHEN** a request with a valid session enters a protected customer route
- **THEN** profile and validation-status retrieval begin without waiting for one another and page rendering starts after both complete

#### Scenario: Load an authentication page
- **WHEN** a request enters login or registration
- **THEN** middleware retrieves only the profile needed to decide whether to redirect an already authenticated customer

### Requirement: Authenticated SSR responses must expose safe server timing
Rendered protected responses SHALL include server timing metrics for authenticated context retrieval, page rendering, and total middleware processing. Timing metadata MUST NOT contain customer identity, session values, URLs, SQL, or provider evidence.

#### Scenario: Inspect a protected page response
- **WHEN** an authenticated customer page renders successfully
- **THEN** its `Server-Timing` header reports generic authentication-context, page-render, and total durations

### Requirement: Authenticated navigation must prefetch explicit destinations safely
The authenticated customer shell SHALL opt its internal navigation links into same-origin hover prefetching. Authorization and SSR route guards MUST still execute when navigation occurs.

#### Scenario: Customer indicates intent to navigate
- **WHEN** a customer hovers or focuses an internal shell navigation link
- **THEN** the browser may prefetch that same-origin destination without changing the current page or bypassing route authorization
