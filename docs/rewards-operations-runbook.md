# Rewards operations runbook

## Safety model

Rewards is enabled through effective-dated database configuration, authenticated application
ports, and deployed scheduler registration. There is no global boolean that safely enables every
feature. A customer flow is available only when its rule, policy, catalog, partner, fulfillment,
and operational dependencies are all approved and active.

Never enable an unresolved dependency to make a screen or test pass. Preserve the existing
`disabled_reason`, create a new version after approval, and retain the old version for audit and
historical interpretation.

## Feature flags and release gates

The effective-dated `enabled` records below are the Rewards feature flags. Environment variables
configure infrastructure, but they do not override an unapproved business version.

Before enabling a capability, record the product/finance/operations owner, approval reference,
effective instant, rollback owner, and reconciliation query. Then verify every applicable gate:

| Gate | Authoritative control |
| --- | --- |
| Rewards eligibility | Active customer, validated SISCA case, active AFORE relation |
| Earning behavior | Effective `behavior_rule_versions` row with approved evidence and value |
| Referral attribution | Effective approved referral-limit policy and authenticated link flow |
| Point redemption | Effective redemption-limit policy, enabled catalog version, inventory, fulfillment, and cancellation/refund policy |
| Product value | Authenticated partner lifecycle adapter and separate restricted-wallet policy |
| Advisor compensation | Effective compensation policy and review/export owner |
| Notification | Approved provider implementation and delivery processor |
| Scheduled work | Registered bounded task and persisted due jobs |

The seeded registration, AFORE-anniversary, and referral award values are versioned. Seeded
catalog entries remain disabled where availability, capacity, fulfillment, travel/event dates, or
cancellation policy is unresolved. The presence of the seeded Skandia rule does not authorize
partner traffic while its lifecycle adapter and product-value flow are absent.

## Rule activation

1. Confirm the evidence source is authenticated, replay-safe, and privacy-reviewed.
2. Create a new effective-dated rule version; do not update historical point value or evidence.
3. Include the approval, timezone/campaign settings, point value, validity policy, and explicit
   disabled reason when the version is not ready.
4. Close the preceding version at the new version's effective instant.
5. Test duplicate evidence, month/timezone boundaries when relevant, disabled behavior, and
   rollback before enabling.
6. Enable the calling HTTP or scheduler path only after the rule lookup returns exactly one
   approved effective version.

To stop a rule, close or supersede its effective version. Do not delete awards already issued;
use an authorized compensating adjustment only when the business owner approves a correction.

## Catalog loading and redemption

Load catalog changes through the authorized version/create/close/capacity operations so actor,
reason, explanation, correlation ID, idempotency key, and before/after state remain auditable.
Do not update catalog or inventory rows directly.

Before enabling an item, verify its price mode, eligibility, effective dates, partner dependency,
inventory mode/capacity, fulfillment owner, and cancellation/refund policy. Controlled capacity
must never be lowered below reserved plus fulfilled commitments. Point redemption remains off
until an approved monthly-limit policy exists; a catalog price by itself is not enough.

If a catalog release fails, close the affected version, stop new reservations, finish or cancel
existing commitments according to the approved policy, release inventory transactionally, and
refund with immutable ledger compensation.

## Partner enablement

- SISCA remains owned by the existing API and exposes only normalized validation evidence to
  site-backend.
- AVE traffic must use an authenticated `AVE` principal with `rewards:ingest:ave`; enable its
  behavior version only after the partner contract is approved.
- Skandia and Qualitas lifecycle traffic must remain unavailable until authenticated replay-safe
  adapters, cancellation ordering, and product-value policies are implemented and approved.
- The expiration-notification provider must remain unregistered until the approved provider,
  template ownership, destination source, and delivery-result mapping are supplied.

Partner logs and audit metadata may contain safe IDs, status codes, counts, and durations only.
They must not contain CURP, credentials, email, phone, raw partner/SISCA payloads, or unrelated
customer data.

## Scheduler operation

Use the bounded runner and recovery procedure in
[`rewards-scheduler-runbook.md`](./rewards-scheduler-runbook.md). Deployment scheduling supplies
one `asOf`, a non-sensitive worker ID, batch size, and maximum batches. A full last batch reports
`exhausted`; schedule another bounded run instead of removing the ceiling.

Stop new invocations before rollback. Persisted due times and unique business keys provide
catch-up; do not edit them to force replay. Manual retry requires `rewards:jobs:retry` and an
immutable safe audit reason.

## Backfill and navigation enablement

Run the validated-customer backfill in staging before customer navigation:

```bash
npm run rewards:backfill -- --dry-run --batch-size=100
npm run rewards:backfill -- --batch-size=100
```

The process manager must supply the staging `DATABASE_URL`. Compare dry-run eligible count with
the executed account count, require zero unresolved failures, and reconcile the one-time
registration awards and balances. Re-running the command must converge through idempotency.

Do not run the non-dry command against production as part of an ad hoc release. Production
execution requires the staged result, owner approval, rollback plan, and a recorded reconciliation.

## Finance reconciliation

An actor with `rewards:finance:view` requests a closed half-open period `[from, to)`. Confirm:

1. issued totals reconcile to the rule breakdown;
2. available and reserved closing values reconcile to ledger, lots, and allocations;
3. consumed/refunded catalog totals reconcile to redemptions and their correlation IDs;
4. expired, adjusted, and refunded totals use immutable ledger entries;
5. campaign and catalog dimensions have no unexplained unattributed values;
6. estimated liability identifies the single effective expected-redemption assumption version;
7. the assumption changes the estimate only, never a customer balance.

If totals disagree, stop the affected export or rollout, preserve the repeatable-read report
inputs, run balance reconciliation, inspect safe job failures, and correct through replay or
compensation. Never rewrite ledger history or alter an assumption retroactively.

## Release and rollback checklist

- migrations upgraded and downgraded against an isolated database;
- API, site-backend, frontend, PostgreSQL integration, and desktop/mobile E2E suites green;
- only approved effective-dated versions enabled;
- provider and scheduler tasks explicitly registered;
- staging backfill and finance reconciliation recorded;
- rollback disables entry points first and preserves historical records;
- smoke test covers eligibility, first balance, earning, catalog/redemption/refund when enabled,
  expiration visibility, and restricted value remaining separate from points.
