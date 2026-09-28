## Context

FastAPI owns customer identity and currently generates `RWD-` plus 32 hexadecimal characters. The identifier is stored as text, is unique, and is copied into the local Bonda provisioning state. Bonda's current microsite rejects that alphanumeric shape and accepts nine-digit numeric affiliate codes. The connected database currently contains six non-numeric customer identifiers and no Bonda affiliate provisioning records.

The format change crosses registration, persistence, existing data, Bonda preparation, and rollback. It must not derive identity from CURP or other personal data and must not silently introduce a second alias.

## Goals / Non-Goals

**Goals:**

- Make every canonical Rewards ID a nine-digit decimal string whose first digit is non-zero.
- Keep new identifiers opaque, random, non-personal, unique, and transactionally created with the customer.
- Migrate existing identifiers atomically and retain an auditable, reversible mapping.
- Keep every local copy of Rewards ID consistent.
- Preserve the existing bounded retry behavior for the unlikely case of a collision.

**Non-Goals:**

- Enabling Bonda customer provisioning, code issuance, or received-coupon history.
- Proving numeric customer provisioning against Bonda production.
- Replacing customer UUIDs, CURP rules, login identity, referral identity, or points records.
- Sending migration mappings or personal data to Bonda.

## Decisions

### Use an exact nine-digit canonical string

The canonical format is the regular language `[1-9][0-9]{8}`. It is stored as text so leading/format semantics remain explicit at API boundaries, while the first non-zero digit avoids systems that reinterpret a decimal value and drop a leading zero. Nine digits match the Bonda-approved technical affiliate shape already validated for catalog reads.

Alternative considered: retain `RWD-...` internally and create a numeric Bonda alias. Rejected because it creates two customer identities and weakens auditability.

### Generate cryptographically random values and rely on the existing unique-retry boundary

The generator chooses uniformly from `100000000` through `999999999` using Python's `secrets` module. PostgreSQL remains the authority for uniqueness. Registration catches the named unique constraint and retries generation a bounded number of times, as it already does.

Alternative considered: expose a sequential database identifier. Rejected because sequential public membership numbers reveal order and scale and are less opaque.

### Migrate existing values with a durable mapping

An Alembic migration locks customer identity writes, creates `customer_rewards_id_migrations`, and records one old-to-new mapping per migrated customer. A deterministic numeric candidate is derived from the old opaque ID only for migration, then advanced within the nine-digit range if it conflicts with an existing or already assigned value. This is not used for future IDs and does not involve personal fields.

The migration updates `customers.rewards_id` and, when the table exists, `bonda_affiliate_provisioning.rewards_id` in the same database transaction. It adds a database check constraint only after every row is compliant. Downgrade removes the constraint, restores local values from the mapping, and removes the mapping table.

### Keep Bonda activation separate

The numeric format removes one compatibility blocker but does not prove affiliate creation or coupon issuance. `BONDA_AFFILIATE_PROVISIONING_ENABLED` and `BONDA_COUPON_REQUESTS_ENABLED` remain false until a later activation change has an approved environment and end-to-end evidence.

## Risks / Trade-offs

- [Nine-digit space can produce random collisions] → Keep the database uniqueness constraint and bounded application retry; never accept a duplicate.
- [Existing external systems may know the former ID] → Preserve the old-to-new mapping and apply only after inventorying integrations; do not activate Bonda writes in this change.
- [Migration is interrupted] → Execute all mappings, dependent updates, and the format constraint in one PostgreSQL transaction.
- [A migrated value collides with an existing numeric ID] → Check both current customers and mappings and deterministically advance to the next available candidate.
- [A deployment runs before the database migration] → Deploy the migration before generator code so new numeric values remain accepted by both old and new application versions.

## Migration Plan

1. Inventory customer count, legacy format count, and Bonda provisioning states without reading personal fields.
2. Apply the Alembic migration in a transaction and verify every customer matches the numeric constraint and every mapping is one-to-one.
3. Deploy the numeric generator and tests.
4. Verify registration, collision retry, profile reads, V2 projection, and read-only Bonda catalog behavior.
5. Keep Bonda provisioning and coupon requests disabled.

Rollback deploys generator code that tolerates restored legacy IDs, then downgrades the migration to restore mapped values. No customer row, account, point entry, validation, or session is deleted.

## Open Questions

- Bonda must still confirm that a customer created with a Carobra nine-digit Rewards ID is accepted in an approved test environment.
