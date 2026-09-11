## Why

Bonda rejects Carobra's current alphanumeric `RWD-...` identifier format while accepting numeric affiliate identifiers. Carobra needs one canonical, non-personal numeric Rewards ID so future customer affiliate provisioning can use the existing identity without aliases or personal data substitutes.

## What Changes

- **BREAKING** New Rewards IDs become opaque nine-digit decimal strings with no leading zero.
- **BREAKING** Existing alphanumeric Rewards IDs are replaced once in a controlled, auditable database migration that preserves a reversible old-to-new mapping.
- Rewards ID generation remains cryptographically random, independent from customer data, and bounded by the existing collision retry behavior.
- Database constraints enforce the numeric format for every customer after migration.
- Local Bonda provisioning references, when present, move atomically with the customer identifier; no live Bonda provisioning or coupon-code request is activated by this change.
- Tests and operational documentation cover generation, collisions, migration, rollback, and safe activation boundaries.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `customer-persistence-model`: Require canonical nine-digit numeric Rewards IDs and define the controlled migration of existing alphanumeric identifiers.

## Impact

- FastAPI Rewards ID generator, customer persistence constraints, Alembic migrations, onboarding and persistence tests.
- Existing customer identity values and any local records that copy `customers.rewards_id`.
- Bonda remains read-only until a later activation change validates customer provisioning and code issuance with the numeric identifier in an approved test environment.
