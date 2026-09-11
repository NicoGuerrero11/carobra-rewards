## ADDED Requirements

### Requirement: Registration must establish the V2 invited journey
The system SHALL create an `INVITED` V2 journey projection when a customer
finishes registration. It SHALL issue exactly one registration award using the
active versioned rule and record its idempotency reference. The journey
projection MUST remain separate from customer identity and raw SISCA data.

#### Scenario: Complete a new registration
- **WHEN** a customer registration is committed successfully
- **THEN** the customer has an `INVITED` journey and one registration award under the active configured rule

#### Scenario: Replay registration processing
- **WHEN** a registration completion event is delivered more than once
- **THEN** the system preserves one invited journey and does not issue a duplicate registration award

### Requirement: Invitation points must not enable redemption
The system SHALL expose redemption eligibility independently from visible point
balance. A customer whose journey has no validated active product MUST be
ineligible to redeem, even when they hold the invited registration award.

#### Scenario: Invited customer views their balance
- **WHEN** an invited customer with registration points opens Rewards
- **THEN** the site shows their balance and that redemption remains unavailable pending product validation

### Requirement: The customer journey summary must expose safe actionable state
The site backend SHALL provide the authenticated customer a summary of current
journey state, safe validation status, redemption eligibility, current level or
pending status, next conditions, active product count, and points summary. It
MUST NOT expose raw SISCA payloads, provider credentials, or internal test
controls.

#### Scenario: Customer opens Rewards while validation is pending
- **WHEN** an authenticated invited customer requests their Rewards summary
- **THEN** the response explains the pending validation state and does not expose sensitive validation evidence

