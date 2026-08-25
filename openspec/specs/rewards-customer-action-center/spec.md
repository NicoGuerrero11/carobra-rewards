# Rewards Customer Action Center

## Purpose

Define truthful, customer-safe actions and contextual guidance in the Rewards
portal.

## Requirements

### Requirement: The portal must provide one truthful next action
The system SHALL select a customer-safe primary action from the authenticated
journey, configured activity assignments, document requests, and learning
assignments. It MUST NOT promise points, level advancement, or completion credit
unless an active approved rule provides that outcome.

#### Scenario: Invited customer has no assigned activity
- **WHEN** an invited customer opens Rewards while product validation remains
  pending and no other action is configured
- **THEN** the portal explains that Carobra is validating the product and does
  not ask the customer to repeat registration or contact an internal provider

#### Scenario: Customer has an assigned questionnaire
- **WHEN** an authenticated customer has a pending configured questionnaire
- **THEN** the portal presents the questionnaire as the primary actionable item
  with its approved status and no invented point value

### Requirement: Customer activities must have real assignment and completion state
The system SHALL expose questionnaires, content, and document requests only from
server-owned assignments. Completion commands MUST be authenticated,
idempotent, bounded, and recorded separately from level or point decisions.

#### Scenario: Customer completes an assigned activity twice
- **WHEN** the same completion command is replayed with the same idempotency
  identity
- **THEN** the system preserves one effective completion and does not duplicate
  profile progress or points

### Requirement: Document requests must use a safe upload boundary
The system SHALL show document type, purpose, status, accepted MIME types, and
maximum size for each assigned request. It MUST NOT accept file content through
generic activity metadata and SHALL enable upload only through a customer-bound
short-lived storage target.

#### Scenario: Storage adapter is unavailable
- **WHEN** a customer has a document request but no upload target can be issued
- **THEN** the portal preserves the request, explains that upload is temporarily
  unavailable, and provides Carobra support guidance without reporting a
  successful submission

### Requirement: Help must be contextual to customer state
The portal SHALL provide customer-facing explanations for invited, active,
attention, inactive, cancellation, reactivation, level, and redemption states
without provider terminology or internal rule details.

#### Scenario: Customer asks why redemption is unavailable
- **WHEN** redemption is disabled for the authenticated journey
- **THEN** the portal explains the customer-visible prerequisite or pending
  product state without exposing feature-flag names or partner configuration
