# Customer Onboarding Auth

## Purpose

Define the Rewards-owned customer registration, authentication, session, and
authenticated status experience for the MVP.

## Requirements

### Requirement: Customers must register with the agreed Rewards-owned fields
The system SHALL provide a customer registration operation that accepts CURP,
first name, last name, email, phone, password, password confirmation, postal
code, state, city, and terms and conditions acceptance. The registration
operation MUST NOT require NSS from the customer.

#### Scenario: Register with required MVP fields
- **WHEN** a customer submits CURP, first name, last name, email, phone,
  password, matching password confirmation, postal code, state, city, and terms
  acceptance
- **THEN** the system accepts the registration request for business validation
  and does not require NSS

#### Scenario: Reject registration without terms acceptance
- **WHEN** a customer submits otherwise valid registration data without
  accepting terms and conditions
- **THEN** the system rejects registration and does not create an auth user,
  customer, consent, or SISCA validation record

#### Scenario: Reject mismatched passwords
- **WHEN** a customer submits a password and password confirmation that do not
  match
- **THEN** the system rejects registration and does not persist the password or
  create any customer records

### Requirement: Registration must persist authentication credentials safely
The system SHALL persist an auth user with a unique normalized email and a
password hash. The system MUST NOT persist the raw password or password
confirmation. Password validation SHALL be enforced by the API even when the
site frontend also validates the form.

#### Scenario: Store only password hash
- **WHEN** registration completes successfully
- **THEN** the persisted auth user contains a password hash and no raw password
  or password confirmation

#### Scenario: Reject duplicate email
- **WHEN** a registration uses an email already assigned to an auth user
- **THEN** the system rejects registration with an email-specific uniqueness
  outcome

### Requirement: Completed registration must create the customer lifecycle atomically and establish V2 idempotently
The system SHALL create the auth user, customer, terms consent record, and
initial pending SISCA validation atomically when customer registration
completes. The site Rewards flow SHALL establish a V2 `INVITED` journey and V2
registration award idempotently and MUST retry that projection during the
authenticated V2 read or backfill if its first attempt is temporarily
unavailable. The operation MUST NOT create or select a V1 rewards model.

#### Scenario: Registration creates validation and Rewards V2 lifecycle
- **WHEN** customer registration completes successfully
- **THEN** the system persists an auth user, customer, accepted terms consent,
  `PENDING` SISCA validation and establishes a V2 invited journey with one
  idempotent V2 registration award

#### Scenario: Recover a temporarily unavailable V2 projection
- **WHEN** customer identity registration commits but the first V2 projection
  attempt is temporarily unavailable
- **THEN** the next authenticated V2 journey read or environment backfill
  establishes the same invited journey without using V1 or duplicating the
  award

#### Scenario: Roll back partial registration
- **WHEN** customer creation, consent creation, or SISCA validation creation
  fails after auth user insertion begins
- **THEN** the system rolls back the full registration transaction and leaves no
  partial auth user or customer identity

### Requirement: Customer login must use email and password
The system SHALL provide a login operation that accepts email and password,
verifies the submitted password against the stored password hash, and creates a
web session for valid credentials.

#### Scenario: Successful login creates session
- **WHEN** a registered customer submits a valid email and password
- **THEN** the system creates a web session and returns an authenticated outcome
  without exposing the password hash

#### Scenario: Invalid login is rejected safely
- **WHEN** a customer submits an unknown email or incorrect password
- **THEN** the system rejects login without revealing which credential was
  invalid

### Requirement: Sessions must be represented with secure browser cookies
The system SHALL support browser sessions through HTTP-only cookies that are
compatible with the site backend and frontend. Session cookies MUST NOT be
readable by frontend JavaScript.

#### Scenario: Authenticated browser session
- **WHEN** login succeeds from the site
- **THEN** the browser receives an HTTP-only session cookie suitable for
  subsequent authenticated site requests

#### Scenario: Frontend cannot read session secret
- **WHEN** frontend JavaScript executes after login
- **THEN** it cannot read the session secret from browser-accessible storage

### Requirement: Customer status must be available to the authenticated customer
The system SHALL allow an authenticated customer to retrieve their own profile
summary and safe SISCA validation status through the site experience. The
response MUST NOT include password hashes, raw SISCA payloads, credentials, or
technical exception details.

#### Scenario: Read own pending validation status
- **WHEN** an authenticated customer opens the customer dashboard while their
  SISCA validation is pending
- **THEN** the system returns their customer summary, `PENDING_VALIDATION`
  customer state, and safe pending validation timing

#### Scenario: Reject unauthenticated profile access
- **WHEN** a request without a valid session asks for the customer profile or
  validation status
- **THEN** the system rejects the request without returning customer data

### Requirement: Customer status messaging must be provider-agnostic
The authenticated customer experience SHALL describe validation and product
status as Carobra-owned customer states. It MUST NOT display SISCA, provider
names, evidence references, checkpoints, request identifiers, or raw
integration errors on customer routes.

#### Scenario: Customer waits for first-product validation
- **WHEN** the customer authenticates while internal validation evidence is
  pending
- **THEN** the portal states that Carobra is validating the product and exposes
  no internal provider or checkpoint terminology

#### Scenario: Internal provider reports a technical failure
- **WHEN** an internal validation request fails technically
- **THEN** the customer receives a stable Carobra status or support message
  without the provider name, raw failure, or retry implementation details
