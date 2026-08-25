# Rewards V2 Legacy Migration

## Purpose

Define the safe, observable migration of existing customers into canonical
Rewards V2 while preserving legacy history.

## Requirements

### Requirement: Legacy rewards history must be preserved but not executed
The system SHALL preserve existing V1 accounts and ledger movements as immutable
audit history while preventing V1 rules from issuing new rewards or determining
customer-facing state.

#### Scenario: Migrate a customer with historical V1 movements
- **WHEN** the canonical V2 migration processes a customer who has V1 ledger
  history
- **THEN** it preserves those movements and creates or reconciles the V2
  projection without deleting or rewriting history

### Requirement: Existing customers must be backfilled idempotently into V2
The system SHALL provide an environment-scoped backfill that creates missing V2
journeys from customer and SISCA evidence using stable idempotency references.
Repeated execution MUST NOT duplicate journeys, product evidence, or awards.

#### Scenario: Backfill a pending customer
- **WHEN** a customer exists without a V2 journey and has no validated SISCA
  evidence
- **THEN** the backfill creates an invited journey and exactly one V2
  registration award

#### Scenario: Backfill a validated customer
- **WHEN** a customer exists without a V2 journey and has validated SISCA
  evidence
- **THEN** the backfill creates the invited journey and synchronizes the
  validated product, level, and V2 awards idempotently

#### Scenario: Rerun the backfill
- **WHEN** the same environment is processed more than once
- **THEN** previously migrated customers are reported as existing or reconciled
  without duplicate financial movements

### Requirement: Migration must be observable and environment-safe
The backfill SHALL support dry-run and apply modes, SHALL report scanned,
migrated, skipped, and failed counts, and MUST operate only on the configured
database environment.

#### Scenario: Inspect before mutation
- **WHEN** an operator runs the backfill in dry-run mode
- **THEN** the tool reports planned actions without writing journeys or awards

#### Scenario: A customer migration fails
- **WHEN** one customer cannot be migrated
- **THEN** the tool reports the customer by safe internal identifier, continues
  according to bounded error handling, and does not expose CURP or credentials
