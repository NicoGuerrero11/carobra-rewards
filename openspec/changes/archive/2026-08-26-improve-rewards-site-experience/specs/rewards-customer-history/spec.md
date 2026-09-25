## MODIFIED Requirements

### Requirement: The portal must expose a unified safe customer timeline
The system SHALL project a bounded chronological timeline from registration,
product lifecycle, profile activity, level decisions, and point movements.
Timeline entries MUST use deterministic identities and customer-safe titles and
MUST NOT duplicate or replace authoritative audit records. The Rewards home
SHALL show only a bounded recent summary, while a focused authenticated Activity
destination SHALL expose the available timeline and point-movement detail from
the server-owned portal projection.

#### Scenario: A first product becomes active
- **WHEN** accepted product evidence activates the customer's first product and changes the level
- **THEN** the timeline shows the Carobra product confirmation, point movement, and resulting level without naming the validation provider or source reference

#### Scenario: Customer opens Rewards home with extensive history
- **WHEN** more timeline or movement entries exist than the home summary limit
- **THEN** the home shows only the recent bounded summary and links to Activity for the complete available detail

#### Scenario: Customer opens focused Activity
- **WHEN** an authenticated customer opens Activity
- **THEN** the page renders customer-safe timeline and point movements from the portal projection without browser-demo history
