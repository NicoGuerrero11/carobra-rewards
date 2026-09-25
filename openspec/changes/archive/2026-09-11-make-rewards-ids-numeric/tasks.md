## 1. Numeric generation contract

- [x] 1.1 Replace the provisional `RWD-...` generator with a cryptographically random nine-digit numeric generator whose first digit is non-zero.
- [x] 1.2 Preserve bounded duplicate-ID retry in registration and add focused generator, registration, and persistence tests for canonical format and collisions.

## 2. Existing identity migration

- [x] 2.1 Add an Alembic migration that records an auditable old-to-new mapping, migrates every legacy customer and local Bonda provisioning reference atomically, and enforces the numeric database constraint.
- [x] 2.2 Add upgrade and downgrade integration coverage proving one-to-one mapping, dependent-reference consistency, constraint enforcement, and preservation of customer business records.

## 3. Operations and rollout

- [x] 3.1 Document deployment order, verification queries, rollback, and the continued prohibition on Bonda customer writes until a later activation gate.
- [x] 3.2 Apply the migration to the connected review environment only after a read-only inventory confirms the affected count and no active Bonda affiliations.

## 4. Verification

- [x] 4.1 Run API lint, type checking, unit/integration tests, OpenSpec strict validation, and safe post-migration checks without exposing customer identifiers.
