## MODIFIED Requirements

### Requirement: Customer status must be available to the authenticated customer
The system SHALL allow an authenticated customer to retrieve their own profile summary and safe SISCA validation status through the existing API-backed site routes, plus safe Rewards eligibility from the site backend. A non-eligible customer SHALL receive the separate validation-status experience. An eligible customer SHALL receive access to site-backend-backed Rewards summary and navigation. Responses MUST NOT include password hashes, raw SISCA payloads, credentials, technical exception details, or another customer's Rewards data.

#### Scenario: Read own pending validation status
- **WHEN** an authenticated customer opens the customer area while their SISCA validation is pending
- **THEN** the system returns their customer summary, `PENDING_VALIDATION` state, safe pending timing, and non-eligible Rewards status without balance or catalog data

#### Scenario: Read eligible customer experience
- **WHEN** an authenticated customer has validated active AFORE service
- **THEN** the system exposes safe Rewards eligibility and permits that customer to load their persisted Rewards resources

#### Scenario: Reject unauthenticated profile access
- **WHEN** a request without a valid session asks for the customer profile, validation status, eligibility, or Rewards resources
- **THEN** the system rejects the request without returning customer or Rewards data
