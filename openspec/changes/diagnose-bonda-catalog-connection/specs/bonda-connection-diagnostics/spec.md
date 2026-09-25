## ADDED Requirements

### Requirement: Read-only readiness command
The backend SHALL expose an operator command that checks the configured technical affiliate, a representative approved coupon, a course video chapter and a wellness video using only bounded GET requests. It MUST NOT connect to the database, provision affiliates, alter progress, issue coupons, or enable write flags.

#### Scenario: All representative reads succeed
- **WHEN** all four endpoints return valid expected content and the technical affiliate exists
- **THEN** the command reports readiness with four successful checks and exits with status 0

#### Scenario: Disabled or incomplete integration
- **WHEN** required flags or credentials are missing, or a fake preview is configured
- **THEN** the command reports configuration failure, exits nonzero and sends no partner requests

### Requirement: Evidence-based failure classification
The command SHALL distinguish explicit missing-technical-affiliate errors, rejected authorization, unavailable content, transport outages and invalid responses. It MUST NOT conclude that a key is wrong or an affiliate was deleted solely from the content API's generic authorization exception.

#### Scenario: Technical affiliate does not exist
- **WHEN** the roster endpoint reports `USER_NOT_FOUND` and content endpoints reject access
- **THEN** the report identifies the missing technical affiliate and recommends authorized recovery without performing a write

#### Scenario: Credential or permission rejected
- **WHEN** an endpoint returns HTTP 401/403 or the documented authorization exception
- **THEN** that check reports rejected credentials or permissions without claiming the key is necessarily incorrect

#### Scenario: Uncertain failure
- **WHEN** the roster returns a generic 404, malformed content, or a network timeout
- **THEN** the report does not identify a missing affiliate without the explicit error code and exits nonzero

### Requirement: Secret-safe bounded diagnostics
The command MUST use HTTPS with an allowed host, reject redirects, bound time and response size, and output only static messages/codes plus safe status metadata. Credentials, authenticated URLs, partner payloads and customer identifiers MUST NOT appear in output or exceptions printed by the CLI.

#### Scenario: Hostile or oversized response
- **WHEN** Bonda returns an oversized, malformed, redirected or secret-containing failure
- **THEN** the command stops that check safely, does not follow the redirect and emits a sanitized diagnostic

### Requirement: Document authorized recovery
The runbook SHALL explain how to run the command, interpret the checks, and recover only an explicitly authorized technical identity while preserving disabled write flags and customer data.

#### Scenario: Recovery verification
- **WHEN** an operator completes an authorized restoration
- **THEN** the documented procedure requires a fresh connection check and account-level verification, without rotating credentials or changing customer levels merely to bypass an error
