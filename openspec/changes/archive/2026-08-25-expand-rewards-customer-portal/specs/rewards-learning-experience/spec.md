## ADDED Requirements

### Requirement: Courses must come from server-owned assignments or catalog configuration
The system SHALL show only approved courses and content assigned or available to the authenticated customer. It MUST NOT fabricate course completion, duration, rewards, or eligibility from frontend fixtures.

#### Scenario: No courses are assigned
- **WHEN** the customer has no approved course assignment
- **THEN** Courses presents a useful empty state and contextual learning categories without reporting available course content

### Requirement: Learning progress must be persisted independently
The system SHALL persist course start, current progress, completion, and last activity as learning state. It MUST NOT change points or level unless an active versioned Rewards rule separately accepts the completion as qualifying activity.

#### Scenario: Customer completes a non-qualifying course
- **WHEN** the customer completes a course that is not mapped by an approved profile-activity rule
- **THEN** the learning progress reaches completion while points and level remain unchanged

### Requirement: Learning recommendations must be customer-safe
The portal SHALL derive recommendations from customer-facing product categories and approved profile context without exposing provider names, evidence references, or internal segmentation labels.

#### Scenario: Customer has an active retirement product
- **WHEN** an approved retirement course is available for a customer with an active retirement product
- **THEN** Courses may recommend it using Carobra product language without revealing the validation source
