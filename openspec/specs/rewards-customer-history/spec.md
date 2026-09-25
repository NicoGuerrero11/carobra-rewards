# Rewards Customer History

## Purpose

Define customer-safe timeline, product-detail, and notification projections.

## Requirements

### Requirement: The portal must expose a unified safe customer timeline
The system SHALL project a bounded chronological timeline from registration,
product lifecycle, profile activity, level decisions, and point movements.
Timeline entries MUST use deterministic identities and customer-safe titles and
MUST NOT duplicate or replace authoritative audit records. The Rewards home
SHALL show only a bounded recent summary, while a focused authenticated Activity
destination SHALL expose the available timeline and point-movement detail from
the server-owned portal projection.

#### Scenario: A first product becomes active
- **WHEN** accepted product evidence activates the customer's first product and
  changes the level
- **THEN** the timeline shows the Carobra product confirmation, point movement,
  and resulting level without naming the validation provider or source reference

#### Scenario: Customer opens Rewards home with extensive history
- **WHEN** more timeline or movement entries exist than the home summary limit
- **THEN** the home shows only the recent bounded summary and links to Activity
  for the complete available detail

#### Scenario: Customer opens focused Activity
- **WHEN** an authenticated customer opens Activity
- **THEN** the page renders customer-safe timeline and point movements from the
  portal projection without browser-demo history

### Requirement: Product detail must hide provider evidence
The system SHALL expose product type, customer-facing status, activation or
ending date, current level impact, and safe lifecycle guidance. It MUST NOT
expose provider, source, source ID, raw evidence, checkpoint, or internal failure
category.

#### Scenario: Customer opens an active product
- **WHEN** the customer requests detail for an active product belonging to their
  account
- **THEN** the response contains the active status and relevant dates but no
  evidence-provider fields

### Requirement: Notifications must derive from real customer events
The system SHALL provide bounded customer notifications for validation, product,
points, level, activity, document, and learning events. A notification MUST
reference an event belonging to the authenticated customer and SHALL keep read
state separate from the authoritative event.

#### Scenario: Customer reads a notification
- **WHEN** the customer marks a notification as read
- **THEN** the system updates only the customer's presentation state and does not
  modify the underlying product, ledger, activity, or level record
