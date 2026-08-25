## ADDED Requirements

### Requirement: Referrals must preserve unique customer attribution
The system SHALL record the eligible referring customer, referred registration, attribution time, source, and status. A referred customer SHALL have at most one accepted referring customer, and self-referrals MUST be rejected.

Each eligible referring customer SHALL use one personal opaque invitation link that is reusable and does not expire. The link MUST NOT encode or expose customer identity data. Registration SHALL capture a valid link in the site backend without forwarding Rewards data to the existing registration API, and customer-facing referral progress MUST NOT identify referred customers.

#### Scenario: Accept a new referral
- **WHEN** an eligible customer refers a distinct person whose registration has no prior accepted attribution
- **THEN** the system stores one referral relation to the referring customer

#### Scenario: Attempt self-referral
- **WHEN** customer identity evidence indicates the referring and referred people are the same
- **THEN** the system rejects the referral and issues no points

#### Scenario: Register from a personal referral link
- **WHEN** a new customer completes registration from a valid personal invitation link
- **THEN** the site backend preserves the existing registration API payload, attributes the registration to the referring customer, and exposes no referring-customer data to the new customer

### Requirement: Referral registration must award 3,000 points once
When an attributed referred customer completes the configured valid registration milestone, the system SHALL issue 3,000 points to the eligible referring customer exactly once.

#### Scenario: Referred customer registers successfully
- **WHEN** a valid attributed referral reaches the registration milestone
- **THEN** the referring customer receives one 3,000-point award

### Requirement: Referral permanence must award 6-month and 12-month milestones
The system SHALL issue an additional 3,000 points when the referred customer's eligible service remains active for 6 months and an additional 5,000 points when it remains active for 12 months.

#### Scenario: Referred customer remains active for 12 months
- **WHEN** a referral has already qualified at registration and the referred AFORE relation remains active through both milestones
- **THEN** the referring customer has one registration, one 6-month, and one 12-month award

### Requirement: Referral abuse controls must be configurable and auditable
The system SHALL enforce configured per-account referral limits, reject duplicate source evidence, and record safe review flags for suspicious volume or attribution conflicts. Flagging MUST NOT expose another customer's sensitive identity data.

#### Scenario: Exceed the monthly referral limit
- **WHEN** a customer attempts to create more accepted referrals than the configured monthly limit
- **THEN** the system rejects or holds the excess attribution for review and issues no immediate award
