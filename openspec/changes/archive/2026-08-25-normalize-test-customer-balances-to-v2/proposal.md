## Why

The current UAT and production databases contain test customers whose balances still include points issued by the retired Rewards V1 model. Those inherited points make V2 acceptance testing ambiguous because the portal does not show the balance a customer would earn under the canonical V2 rules alone.

## What Changes

- Add an explicit, operator-triggered normalization for existing test customers that removes retired V1 points from their effective balance.
- Preserve accounting traceability by recording an idempotent compensating ledger entry instead of deleting historical ledger rows.
- Keep all canonical V2 awards intact: 45 points for registration and 105 additional points after SISCA validation.
- Provide dry-run and apply modes with per-environment result counts so the cleanup can be verified before and after execution.
- **BREAKING** Existing test balances that include V1 awards will decrease to their V2-only totals.

## Capabilities

### New Capabilities
- `rewards-v2-test-balance-normalization`: Operator-controlled normalization of test-customer balances to canonical V2 totals while preserving an auditable ledger.

### Modified Capabilities

None.

## Impact

- Affects the site-backend rewards ledger, account balances, database migration/operations tooling, and UAT/production test data.
- Does not change new-customer earning rules, public APIs, SISCA behavior, or production eligibility rules.
- Requires deliberate execution in each target environment; normal application startup must not perform destructive normalization automatically.
