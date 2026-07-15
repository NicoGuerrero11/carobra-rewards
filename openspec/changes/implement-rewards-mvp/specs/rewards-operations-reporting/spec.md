## ADDED Requirements

### Requirement: Point expiration notifications must be idempotent
The system SHALL schedule customer notifications 60 and 30 days before unused point lots expire. Each notification window SHALL be delivered at most once per account and expiration cohort, and delivery history SHALL retain a safe outcome.

#### Scenario: Notification job is retried
- **WHEN** the 30-day expiration notification job is delivered repeatedly
- **THEN** the customer receives at most one notification for that cohort and the retries reuse the recorded outcome

### Requirement: Administrative adjustments must require authorization and audit context
Only authorized operators SHALL create point or product-wallet adjustments. Each adjustment MUST record actor, reason code, explanation, correlation ID, affected source, and compensating entry without editing history.

#### Scenario: Unauthorized adjustment request
- **WHEN** an unauthenticated or unauthorized actor requests a balance adjustment
- **THEN** the system rejects it without changing ledger or wallet state

### Requirement: Inventory operations must preserve controlled totals
Authorized operations SHALL create and version catalog inventory, add capacity, close availability, and reconcile reservations without allowing fulfilled plus reserved quantities to exceed controlled capacity.

#### Scenario: Reduce inventory below active commitments
- **WHEN** an operator attempts to lower capacity below reserved and fulfilled units
- **THEN** the system rejects the update and preserves existing commitments

### Requirement: Financial reports must reconcile to authoritative records
The system SHALL report issued, available, reserved, consumed, expired, adjusted, refunded, and estimated-liability points by period and relevant rule, campaign, or catalog dimensions. The expected-redemption assumption SHALL be configurable and MUST NOT alter customer balances.

#### Scenario: Produce monthly liability report
- **WHEN** an authorized finance user requests a closed monthly period
- **THEN** totals reconcile to ledger and lot records and the report identifies the assumption version used for estimated liability

### Requirement: Operational jobs must be replay-safe and observable
Scheduled award, expiration, notification, inventory, and reporting jobs SHALL use persisted due times, bounded batches, unique business keys, and safe execution history so downtime can be caught up without duplicate effects.

#### Scenario: Scheduler restarts after downtime
- **WHEN** overdue milestone and expiration jobs are processed after restart
- **THEN** the system catches up eligible work once per business key and records successes and safe failures

