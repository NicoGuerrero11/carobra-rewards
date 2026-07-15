## 1. Rewards foundation and persistence

- [x] 1.1 Create site-backend module boundaries, shared identifiers, enums, clocks, and error contracts for Rewards accounts, ledger, catalog, referrals, products, advisors, and operations.
- [x] 1.2 Add site-backend PostgreSQL models and migrations for Rewards accounts, behavior-rule versions, normalized reward events, point lots, ledger entries, and point allocations with required uniqueness and indexes.
- [x] 1.3 Add site-backend PostgreSQL models and migrations for scheduled Rewards jobs and safe execution history with unique business keys.
- [x] 1.4 Add site-backend PostgreSQL models and migrations for catalog items, inventory, entitlements, redemptions, waitlists, and redemption allocations.
- [x] 1.5 Add site-backend PostgreSQL models and migrations for referrals, product contracts, restricted wallets, advisor attribution, compensation policies, compensation records, and review flags.
- [x] 1.6 Seed effective-dated baseline behavior values and keep unresolved monthly, birthday-source, AVE, Qualitas, catalog, and advisor policies disabled with explicit reasons.
- [x] 1.7 Add site-backend migration upgrade/downgrade, constraint, relationship, and baseline-seed tests against an isolated PostgreSQL database.

## 2. Eligibility, SISCA activation, and first usable summary

- [x] 2.1 Implement a site-backend eligibility query using API-authenticated customer identity and the necessary Carobra-owned Neon facts for active customer, validated SISCA case, and active AFORE relation.
- [x] 2.2 Implement idempotent Rewards-account activation and the deterministic 2,000-point registration award behind an application port.
- [x] 2.3 Trigger site-backend Rewards activation when validated API evidence is observed, without adding Rewards writes or dependencies to the existing SISCA service.
- [x] 2.4 Add site-backend domain and PostgreSQL tests for first activation, rollback, replay, and concurrent validated-evidence observation.
- [x] 2.5 Implement a replay-safe backfill command for already validated AFORE customers and test dry-run, retry, and collision behavior.
- [x] 2.6 Add authenticated site-backend contracts for Rewards eligibility and account summary with stable `rewards_not_eligible` and `unauthenticated` outcomes.
- [x] 2.7 Extend the existing site-backend API client only for safe identity/SISCA evidence and add contract tests preserving current registration, login, and session behavior.
- [x] 2.8 Replace the frontend catch-all customer redirect with server-side pending-versus-eligible routing and add `/cliente/validacion` and `/cliente/recompensas` entry pages.
- [x] 2.9 Implement the responsive Rewards summary shell using persisted balance, expiration, AFORE status, recent movement, earning, and benefit placeholders from site-backend contracts.
- [x] 2.10 Add desktop and 320-pixel end-to-end tests proving pending customers cannot see Rewards data and eligible customers see the initial 2,000-point account.

## 3. Immutable point ledger and lifecycle

- [x] 3.1 Implement reward-event normalization and stable source idempotency validation for internal, scheduled, browser, and partner evidence.
- [x] 3.2 Implement atomic point issuance that creates an immutable ledger entry and expiring lot under the applied rule version.
- [x] 3.3 Implement authoritative balance and next-expiration queries plus reconciliation of any transactional summary cache.
- [x] 3.4 Implement FIFO lot allocation, point reservation, consumption, and release with row locking and negative-balance protection.
- [x] 3.5 Implement expiration processing for normal 18-month and configured 90-day campaign lots with replay-safe jobs.
- [x] 3.6 Implement authorized compensating adjustments and refunds that never mutate historical entries.
- [x] 3.7 Add unit and PostgreSQL concurrency tests for duplicate events, competing spends, multi-lot FIFO, expiration, adjustment, refund, and reconciliation.

## 4. Primary earning behaviors

- [x] 4.1 Implement effective-dated behavior-rule lookup and disabled-rule handling that preserves the applied version on every event and award.
- [x] 4.2 Implement onboarding evidence aggregation and the one-time 5,000-point award, leaving the rule disabled until required evidence and Cinepolis fulfillment are approved.
- [x] 4.3 Implement authenticated qualifying-site-action ingestion and monthly uniqueness by customer, business month, timezone, and rule version.
- [x] 4.4 Add the 1,000-point monthly-interaction rule activation configuration and tests for login-only, repeat action, month boundary, and disabled behavior.
- [x] 4.5 Add verified birth-date source support and the annual 5,000-point birthday scheduler without deriving unapproved data.
- [x] 4.6 Implement replay-safe 6/12/18-month AFORE anniversary jobs awarding 5,000, 15,000, and 35,000 points only while eligible.
- [x] 4.7 Define and implement the authenticated AVE adapter contract and the idempotent 500-point confirmed-contribution award.
- [x] 4.8 Add site-backend HTTP, scheduler, persistence, and catch-up tests for every primary behavior and disabled integration state.

## 5. Catalog, inventory, and redemption experience

- [x] 5.1 Implement catalog and inventory domain rules for free entitlements, point rewards, product benefits, unlimited, controlled, campaign, and waitlist modes.
- [x] 5.2 Incorporate the approved catalog document into versioned catalog seeds/configuration before enabling customer redemption.
- [x] 5.3 Implement authorized catalog and inventory create/version/close/capacity operations with commitment-safe validation and audit history.
- [x] 5.4 Implement free-entitlement grant and use flows without changing universal point balance.
- [x] 5.5 Implement atomic point-redemption creation across eligibility, monthly policy, FIFO allocation, ledger consumption, and controlled inventory reservation.
- [ ] 5.6 Implement redemption confirmation, fulfillment, cancellation, refund, inventory release, and waitlist promotion state transitions.
- [x] 5.7 Implement configurable monthly redemption-limit policies and keep redemption disabled until an approved limit version exists.
- [ ] 5.8 Add authenticated site-backend contracts for catalog, entitlement, redemption creation/cancellation, and redemption history.
- [ ] 5.9 Replace demo benefits and activity pages with site-backend-backed catalog, detail, confirmation, feedback, movement, and redemption-status views.
- [ ] 5.10 Add concurrency, rollback, error-contract, accessibility, desktop, and mobile tests for the complete redemption flow.

## 6. Referrals and permanence

- [x] 6.1 Implement unique referral attribution with self-referral, duplicate attribution, identity-conflict, and configurable monthly-limit controls.
- [x] 6.2 Integrate valid referral capture into registration without exposing referring-customer data to the referred customer.
- [x] 6.3 Implement the idempotent 3,000-point referred-registration award.
- [x] 6.4 Implement replay-safe 6-month and 12-month referral permanence jobs awarding 3,000 and 5,000 points while eligibility remains valid.
- [x] 6.5 Add authenticated customer referral site-backend/frontend flows and safe progress/status presentation.
- [x] 6.6 Add tests for self-referral, competing attribution, monthly limit, service loss, duplicate milestones, and advisor-originated customer referrals.

## 7. Cross-selling products and restricted wallets

- [ ] 7.1 Implement product-contract lifecycle and authenticated replay-safe adapter contracts for Skandia and Qualitas contracting, activation, permanence, cancellation, and benefit use.
- [ ] 7.2 Implement the enabled 5,000-point Skandia PPR/life contracting award once per qualifying contract.
- [ ] 7.3 Implement the 5,000-point 12-month Skandia/Qualitas permanence award with cancellation-safe milestone processing.
- [ ] 7.4 Implement restricted product wallets using decimal currency amounts, product scope, vesting/release conditions, and immutable compensating transitions separate from points.
- [ ] 7.5 Implement configurable Skandia customer-share accrual, 12-month release, product application, and clawback processing.
- [ ] 7.6 Implement both supported Qualitas activation policy strategies, enabling only the approved version and value.
- [ ] 7.7 Add site-backend/frontend presentation for product contracts, pending/available restricted value, and Qualitas benefit state without adding it to point balance.
- [ ] 7.8 Add adapter contract, replay, out-of-order event, cancellation, vesting, clawback, privacy, and UI separation tests.

## 8. Advisor attribution and compensation

- [ ] 8.1 Implement advisor identities and origin attribution for customer registrations and product contracts independently from customer referrals.
- [ ] 8.2 Implement effective-dated compensation policies and auditable calculation records preserving gross, advisor, and customer-benefit shares.
- [ ] 8.3 Implement the approved platform cross-sell split, including the 80/20 baseline and hold-for-review behavior when activity-dependent full commission is undefined.
- [ ] 8.4 Implement advisor convention incentives in a separate advisor ledger or export without modifying customer point accounts.
- [ ] 8.5 Implement weekly registration limits, conflict checks, suspicious-volume flags, and review-safe data access.
- [ ] 8.6 Implement authorized compensation review/export integration points and immutable external payment references.
- [ ] 8.7 Add tests for customer-referral ownership, policy versions, activity evidence, split calculations, review holds, limits, and data isolation.

## 9. Operations, notifications, and finance

- [x] 9.1 Implement persisted 60-day and 30-day expiration-notification jobs with cohort idempotency and safe delivery outcomes.
- [ ] 9.2 Integrate the approved notification provider through a port that excludes point-sensitive and customer-sensitive data from logs.
- [x] 9.3 Implement authorized operational views and commands for adjustments, catalog/inventory control, failed jobs, and manual retry.
- [x] 9.4 Implement period-based financial queries for issued, available, reserved, consumed, expired, adjusted, refunded, and campaign/catalog dimensions.
- [x] 9.5 Implement versioned expected-redemption assumptions and estimated-liability reporting without affecting customer balances.
- [x] 9.6 Add bounded scheduler runners, safe telemetry, catch-up behavior, and runbooks for awards, expiration, notification, inventory, and reporting jobs.
- [x] 9.7 Add authorization, reconciliation, retry, notification-idempotency, report-total, and scheduler-recovery tests.

## 10. Cross-application hardening and release

- [x] 10.1 Define and document stable site-backend error envelopes and pagination contracts across all Rewards resources while preserving existing API auth/SISCA envelopes.
- [x] 10.2 Verify API logs, partner adapters, and audit metadata do not expose CURP, credentials, raw SISCA payloads, or unrelated customer data.
- [x] 10.3 Add existing-API regression, site-backend contract, frontend SSR, and browser end-to-end coverage for eligible, pending, inactive, and attention-required customers.
- [x] 10.4 Run the unchanged API formatting, linting, type checking, unit/integration tests, and Alembic verification to prove registration, login, and SISCA behavior remain intact.
- [x] 10.5 Run site-backend check, tests, and build plus site-frontend check, build, desktop/mobile accessibility, and end-to-end suites.
- [ ] 10.6 Execute the safe validated-customer backfill in a staging environment and reconcile account count, initial awards, and balances before enabling navigation.
- [x] 10.7 Document feature flags, rule activation, catalog loading, partner enablement, scheduler operation, rollback, and finance reconciliation procedures.
- [ ] 10.8 Review all open commercial decisions with product, finance, operations, and partner owners and enable only approved effective-dated versions.
- [ ] 10.9 Perform a staged customer smoke test covering SISCA activation, first balance, earning, catalog, redemption, refund, expiration visibility, and restricted-wallet separation.
