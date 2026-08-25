## ADDED Requirements

### Requirement: Dry-run reports removable V1 balances without mutation
The system SHALL provide an operator command that identifies V1 point lots on accounts with an existing Rewards V2 journey and reports the number of affected accounts and removable points without changing persistent state by default.

#### Scenario: Operator previews normalization
- **WHEN** an operator runs the normalization command without the apply flag
- **THEN** the command reports affected accounts and removable V1 points and makes no database mutation

### Requirement: Apply removes only unspent V1 points
The system SHALL remove the remaining points from V1-provenance lots, decrement the corresponding account available balance by the identical amount, and preserve every V2-provenance lot and award.

#### Scenario: Invited test customer has a legacy balance
- **WHEN** an invited customer has 2,000 unspent V1 points and 45 V2 registration points and the operator applies normalization
- **THEN** the account has 45 available points and its V2 registration lot remains unchanged

#### Scenario: Validated test customer has a legacy balance
- **WHEN** a SISCA-validated customer has 2,000 unspent V1 points plus 150 canonical V2 points and the operator applies normalization
- **THEN** the account has 150 available points and retains the V2 registration and validation awards

### Requirement: Normalization is idempotent and auditable
The system MUST record a compensating ledger entry with a stable per-account idempotency key and MUST NOT subtract a legacy balance more than once.

#### Scenario: Operator replays apply
- **WHEN** normalization has already succeeded for an account and the operator runs apply again
- **THEN** no additional points are removed and the result reports no remaining normalization work

### Requirement: Unsafe balances fail closed
The system MUST refuse to normalize an account whose V1 lots support an active reservation or whose available balance is smaller than the removable V1 amount.

#### Scenario: Legacy points are reserved
- **WHEN** an affected account has an active reservation allocated from a V1 point lot
- **THEN** that account is left unchanged and the command reports a safe failure code

### Requirement: Customer-facing V2 history excludes retired-model cleanup
The Rewards V2 portal SHALL exclude retired V1 issuance and the technical normalization adjustment while preserving canonical V2 awards and V2 operational movements.

#### Scenario: Normalized customer opens rewards history
- **WHEN** a customer whose V1 balance was normalized opens the V2 rewards portal
- **THEN** the portal shows the V2 awards and does not show the retired V1 issuance or technical adjustment
