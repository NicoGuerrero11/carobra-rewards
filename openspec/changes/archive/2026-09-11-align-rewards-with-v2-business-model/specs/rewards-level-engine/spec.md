## ADDED Requirements

### Requirement: Level decisions must be independent from points balance
The system SHALL calculate a customer's level exclusively from effective
product facts, registration permanence, and configured qualifying activity. It
MUST NOT use earned, available, redeemed, expired, or adjusted points as a
level input.

#### Scenario: Customer redeems points
- **WHEN** an eligible customer redeems points without a product or activity change
- **THEN** their level remains unchanged

### Requirement: Every level calculation must be deterministic and auditable
The system SHALL persist the effective rule version, evaluated evidence,
resulting level, decision time, and transition reason for every change of
level. Re-evaluating identical effective inputs MUST produce the same result.

#### Scenario: Product cancellation changes level eligibility
- **WHEN** a product fact changes from active to ended
- **THEN** the system records a new level decision with the product evidence and downgrade reason

### Requirement: Unapproved thresholds must not create production transitions
The system SHALL require an active approved configuration for any level rule
whose threshold or precedence is unresolved. In its absence, it MUST retain the
last approved level decision and report the unresolved condition safely for
operations and test mode.

#### Scenario: Plata threshold is not configured
- **WHEN** a Bronze customer reaches six months but no approved Plata activity rule exists
- **THEN** the system does not promote the customer automatically and records that the required rule is unavailable

