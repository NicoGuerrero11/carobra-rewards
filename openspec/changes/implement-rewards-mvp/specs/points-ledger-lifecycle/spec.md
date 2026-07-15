## ADDED Requirements

### Requirement: Point history must be immutable and auditable
The system SHALL represent every issuance, consumption, expiration, adjustment, and refund as an immutable typed ledger entry linked to the responsible account, source, rule version, correlation identifier, and timestamp. Historical entries MUST NOT be edited or deleted through application operations.

#### Scenario: Correct an erroneous award
- **WHEN** an authorized operator corrects an issued award
- **THEN** the system creates a compensating adjustment with actor and reason instead of rewriting the original entry

### Requirement: Credits must preserve lot-level validity
Each point credit SHALL create a lot with issued points, remaining points, issued time, and expiration time. Normal awards SHALL expire 18 months after issuance and an enabled temporary-campaign rule MAY set a 90-day validity.

#### Scenario: Issue a normal behavior award
- **WHEN** an eligible behavior issues points under the normal validity policy
- **THEN** the resulting lot expires exactly 18 months after its issuance instant

#### Scenario: Expire unused points
- **WHEN** a lot reaches its expiration instant with unused points
- **THEN** the system creates an expiration entry, removes only the unused amount from available balance, and does not replace the points

### Requirement: Point consumption must use earliest-expiring lots first
The system SHALL allocate point-consuming operations against available lots ordered by expiration time and then issuance time. Consumption MUST NOT use expired, reserved, or already-consumed points.

#### Scenario: Redeem across two lots
- **WHEN** a redemption requires more points than remain in the earliest-expiring lot
- **THEN** the system consumes that lot first and allocates the remainder from the next eligible lot

### Requirement: Ledger operations must be idempotent and concurrency-safe
Every award or externally triggered ledger operation SHALL require a stable idempotency key. Database constraints and transactional locking SHALL prevent duplicate issuance, overspending, and negative available balances under concurrent execution.

#### Scenario: Deliver one earning event concurrently
- **WHEN** two workers process the same source event at the same time
- **THEN** exactly one credit is issued and both workers observe the same business result

#### Scenario: Submit competing redemptions
- **WHEN** two redemptions concurrently request more points than the account can satisfy together
- **THEN** at most one succeeds and the account balance never becomes negative

### Requirement: Account summaries must reconcile to authoritative history
The system SHALL expose available, reserved, consumed, and next-expiring point values derived from authoritative lots, allocations, and ledger entries. Any cached aggregate MUST be transactionally maintained and rebuildable.

#### Scenario: Read account summary after refund
- **WHEN** a completed refund creates compensating point value
- **THEN** the account summary includes the restored amount and reconciles to ledger history

