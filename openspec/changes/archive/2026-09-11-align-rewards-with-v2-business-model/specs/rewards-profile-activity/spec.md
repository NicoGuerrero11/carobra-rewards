## ADDED Requirements

### Requirement: Qualifying profile activity must be configuration-driven
The system SHALL record customer activities with type, occurrence time, source,
and idempotency reference. It SHALL count an activity toward profile progress
only when an active versioned configuration declares that type and its
qualification window.

#### Scenario: Customer completes a configured questionnaire
- **WHEN** a customer completes a questionnaire configured as qualifying activity
- **THEN** the system records the activity and includes it in the customer's profile-progress aggregate

### Requirement: Progress must explain its basis without exposing internal rules
The customer summary SHALL show the approved progress toward the next eligible
level when that rule is active. It MUST NOT expose test controls or invent a
numeric threshold when the business rule is unapproved.

#### Scenario: Plata rule is active
- **WHEN** a customer has completed some but not all configured profile activities for Plata
- **THEN** the summary shows the remaining approved progress condition

