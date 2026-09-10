## ADDED Requirements

### Requirement: Bonda integration must remain behind the V2 site backend
The site backend SHALL be the only application that calls Bonda. It SHALL attach Bonda credentials, authenticate the Carobra customer, enforce the canonical level policy, and translate partner responses into stable Carobra contracts. The frontend MUST use same-origin Carobra routes and MUST NOT receive a Bonda API key, affiliate token, microsite identifier, or unrestricted partner URL.

#### Scenario: Browser loads the coupon catalog
- **WHEN** the authenticated frontend requests customer coupons
- **THEN** it calls a same-origin Carobra endpoint and the site backend performs any required Bonda request

#### Scenario: Inspect a customer response
- **WHEN** the site backend returns a catalog or coupon-code result
- **THEN** the payload contains no Bonda credentials, raw partner response, or unrestricted internal integration field

### Requirement: Partner configuration must fail closed
The system SHALL validate the Bonda base URL against an explicit environment allowlist and SHALL keep live partner calls disabled when required configuration is missing. Missing Bonda configuration MUST NOT prevent the non-Bonda portions of Carobra from starting.

#### Scenario: Start development without Bonda credentials
- **WHEN** developers run the Carobra applications without a Bonda token or API key
- **THEN** authentication, registration, Rewards level, and non-Bonda pages continue to operate while live coupon actions remain disabled

#### Scenario: Configure an unapproved Bonda host
- **WHEN** the supplied Bonda base URL is outside the environment allowlist
- **THEN** configuration validation rejects live partner calls before any credential is transmitted
