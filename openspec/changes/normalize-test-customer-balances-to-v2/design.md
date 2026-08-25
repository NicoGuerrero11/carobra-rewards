## Context

Rewards V1 issuance is disabled, but existing test accounts still own V1 point lots and their denormalized `rewards_accounts.available_points` includes those lots. Rewards V2 reuses the same account and ledger, so simply backfilling V2 adds 45/105 points on top of the historical V1 balance. The cleanup must make the effective balance V2-only without silently corrupting ledger invariants.

## Goals / Non-Goals

**Goals:**

- Remove all unspent V1 points from accounts that already have a V2 journey.
- Make the operation dry-run-first, explicit, idempotent, and safe to replay.
- Preserve an audit trail and keep account, lot, and ledger totals coherent.
- Show only canonical V2 award movements in the V2 portal.

**Non-Goals:**

- Recalculate or alter canonical V2 awards.
- Run automatically during application startup.
- Normalize customers without a V2 journey or accounts with active reservations backed by V1 lots.
- Provide a general-purpose production balance editor.

## Decisions

1. Use an operator CLI with dry-run as the default and `--apply` as the explicit mutation switch. A database migration was rejected because migrations run as part of schema lifecycle and would make a test-data decision implicit and difficult to review per environment.
2. Normalize only remaining V1 lots whose source ledger entry references `behavior_rule_versions`; V2 lots reference `rewards_v2_rule_versions`. This uses durable provenance rather than guessing from point amounts.
3. Zero the remaining V1 lots, decrement the denormalized available balance by the same amount, and insert one negative `ADJUSTMENT` entry per account with a stable idempotency key. Deleting historical rows was rejected because it would erase evidence and can violate downstream foreign keys.
4. Abort an individual account when any V1 lot has a live reservation or when its available balance cannot cover the removable points. This avoids manufacturing an inconsistent reserved balance.
5. Exclude entries backed by a retired V1 rule and the technical normalization adjustment from V2 portal movement queries. Other rule-less operational movements remain visible so future V2 reservations, consumption, and releases are not accidentally hidden.

## Risks / Trade-offs

- [A current account is accidentally included] → Require an existing V2 journey and V1-provenance lots; use dry-run counts before apply.
- [A replay subtracts twice] → Use a unique per-account idempotency key and re-check state inside a locked transaction.
- [Reserved or consumed points make subtraction unsafe] → Subtract only lot `remaining_points` and reject accounts with active V1 reservations.
- [Audit history differs from customer-facing history] → Preserve the full ledger for operators while intentionally exposing only V2 movements in the V2 portal.

## Migration Plan

1. Deploy the CLI and portal filtering to UAT and production.
2. Run dry-run in UAT, apply, then rerun dry-run and verify no removable balances remain.
3. Repeat for the current production test population.
4. Confirm invited customers show 45 points and SISCA-validated Bronze customers show 150 points.

Rollback is a deliberate compensating issuance using the recorded normalization entry; the CLI itself does not silently restore retired V1 points.

## Open Questions

None. The user confirmed that all currently affected customers are test customers and should display V2-only balances.
