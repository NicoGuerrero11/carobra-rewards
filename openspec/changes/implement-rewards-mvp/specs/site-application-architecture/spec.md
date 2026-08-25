## MODIFIED Requirements

### Requirement: API must preserve the existing registration, authentication, and SISCA boundary
The FastAPI service SHALL continue to own the already implemented registration, login, HTTP-only session, customer identity, and CURP-based SISCA consultation flows. It SHALL persist only Carobra-owned customer and SISCA validation facts required by those flows. It MUST NOT own the Rewards ledger, behaviors, referrals, catalog, inventory, redemptions, product wallets, advisor compensation, or Rewards operations. SISCA MUST NOT receive access to Carobra's database or any Rewards resource.

#### Scenario: Register and validate an existing customer flow
- **WHEN** the site submits registration and the validation scheduler consults SISCA using the customer's CURP
- **THEN** the API preserves the existing registration/login behavior, sends only the required SISCA request, stores the safe result in Carobra's Neon database, and returns no Rewards data to SISCA

#### Scenario: Rewards command reaches the application
- **WHEN** an authenticated customer submits a redemption or earning command
- **THEN** the site backend handles the Rewards operation and does not add that domain behavior to the FastAPI service

### Requirement: Site backend must own Rewards business state
The Node site backend SHALL own Rewards accounts, eligibility decisions, point ledger, behaviors, referrals, catalog, inventory, redemptions, product wallets, advisor compensation, operational controls, scheduled jobs, and the corresponding tables in Carobra's Neon database. It SHALL use the existing API-issued session for identity and read only the necessary Carobra-owned customer and validation facts from Neon for eligibility, but MUST NOT duplicate password validation, SISCA partner logic, or raw SISCA data.

#### Scenario: Site backend activates Rewards from validated evidence
- **WHEN** the authenticated API contracts report an active customer with validated AFORE evidence
- **THEN** the site backend idempotently creates or reads that customer's Rewards account and registration award in its own transaction

#### Scenario: Site backend processes a redemption
- **WHEN** an eligible customer submits a redemption through the site
- **THEN** the site backend validates eligibility, points, policy, and inventory and atomically writes the Rewards result to Carobra's Neon database

### Requirement: Site frontend must start from the demo Rewards frontend
The site frontend SHALL retain the approved visual foundation imported from `NicoGuerrero11/demo-rewards` while adapting customer Rewards pages to authenticated site-backend contracts. Demo-only business data, browser `sessionStorage` balances, mock redemptions, mock auth assumptions, and unapproved OAuth links MUST NOT remain enabled as production behavior.

#### Scenario: Reuse the visual foundation
- **WHEN** the Rewards customer experience is implemented
- **THEN** it uses the existing Carobra layout, responsive styles, and assets while rendering persisted site-backend data

#### Scenario: Remove browser-authoritative demo state
- **WHEN** an eligible customer loads or changes a Rewards resource
- **THEN** the browser reads or commands site-backend state and does not treat demo `sessionStorage` as authoritative

### Requirement: Frontend forms must call the site backend
The site frontend SHALL submit registration, login, logout, profile, validation-status, Rewards, and redemption requests through same-origin site-backend routes. The site backend MAY forward existing registration, authentication, and SISCA-status operations to FastAPI, but SHALL execute Rewards operations itself. Direct browser calls to FastAPI, SISCA, or Neon MUST NOT be required.

#### Scenario: Submit a login through the site backend
- **WHEN** a customer logs in from the frontend
- **THEN** the site backend preserves the existing FastAPI authentication contract and adapts the API-issued HTTP-only cookie

#### Scenario: Submit a redemption through the site backend
- **WHEN** a customer confirms a catalog redemption in the frontend
- **THEN** the frontend sends the command to the site backend and the site backend executes the Rewards transaction without calling SISCA
