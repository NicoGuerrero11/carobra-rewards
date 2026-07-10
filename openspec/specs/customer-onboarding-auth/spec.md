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

### Requirement: Completed registration must create the customer, consent, and validation atomically
The system SHALL create the auth user, customer, terms consent record, and
initial pending SISCA validation in one transaction when customer registration
completes. If any required record cannot be created, the transaction MUST roll
back completely.

#### Scenario: Registration creates validation lifecycle
- **WHEN** customer registration completes successfully
- **THEN** the system persists an auth user, customer, accepted terms consent,
  and a `PENDING` SISCA validation for the customer in the same transaction

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
