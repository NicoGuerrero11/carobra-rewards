## ADDED Requirements

### Requirement: Earning rules must be versioned and configurable
The system SHALL persist effective-dated behavior rules containing code, enabled state, point value, validity policy, evidence requirements, and version. A rule without approved value or evidence MUST remain disabled and MUST NOT issue points.

#### Scenario: Change a behavior value prospectively
- **WHEN** an authorized rule version becomes effective
- **THEN** later events use the new version while earlier awards retain their original rule and value

### Requirement: Completed onboarding must award the configured MVP value once
When the configured onboarding-completion evidence is satisfied after Rewards eligibility, the system SHALL issue 5,000 points exactly once for that onboarding instance.

#### Scenario: Complete all configured onboarding evidence
- **WHEN** an eligible customer satisfies the enabled confirmation, video, and survey evidence rule
- **THEN** the system issues one 5,000-point onboarding award and records the evidence version

### Requirement: Monthly interaction must require login plus a qualifying action
The monthly-interaction rule SHALL require a valid authenticated session and at least one configured qualifying site action in the configured business month. It SHALL issue at most 1,000 points per customer per business month and SHALL remain disabled until the action catalog and timezone are approved.

#### Scenario: Repeat qualifying actions in one month
- **WHEN** an eligible customer performs multiple qualifying actions during the same business month
- **THEN** the system issues at most one 1,000-point monthly-interaction award

#### Scenario: Login without a qualifying action
- **WHEN** a customer only authenticates or refreshes a session
- **THEN** the system does not issue monthly-interaction points

### Requirement: Customer birthday must award 5,000 points from verified data
The system SHALL issue 5,000 birthday points at most once per customer per calendar year only when an approved source supplies a verified birth date. It MUST NOT infer or persist an unapproved date solely to enable the award.

#### Scenario: Reach birthday with verified date
- **WHEN** an eligible customer reaches the configured birthday date and has not received the award that year
- **THEN** the system issues one 5,000-point birthday award

### Requirement: AFORE anniversaries must award the agreed milestones
The system SHALL use the active AFORE relation start time to issue 5,000 points at 6 months, 15,000 points at 12 months, and 35,000 points at 18 months when the relation remains eligible at the milestone.

#### Scenario: Reach the 12-month AFORE milestone
- **WHEN** an eligible AFORE relation reaches 12 months active
- **THEN** the system issues exactly one 15,000-point anniversary award

#### Scenario: Scheduled milestone is delivered twice
- **WHEN** the same anniversary job is repeated or processed concurrently
- **THEN** only one award exists for that customer, relation, and milestone

### Requirement: Confirmed voluntary AFORE contributions must award 500 points
An enabled AVE adapter SHALL normalize a confirmed voluntary-contribution event and issue 500 points once per qualifying external contribution identifier. Unconfirmed, reversed, or duplicate evidence MUST NOT issue an additional award.

#### Scenario: Receive a confirmed AVE event
- **WHEN** the configured source reports a new qualifying voluntary AFORE contribution for an eligible customer
- **THEN** the system issues one 500-point award linked to the external contribution identifier

