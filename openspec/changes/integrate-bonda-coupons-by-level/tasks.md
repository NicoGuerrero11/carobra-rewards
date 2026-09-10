## 1. Bonda configuration and adapter contracts

- [x] 1.1 Add fail-closed Bonda environment configuration for base URL allowlist, microsite ID, coupon API key, affiliate token, timeouts, and independent feature gates; document placeholders without committing secrets.
- [x] 1.2 Define stable site-backend contracts and safe error codes for affiliate provisioning, catalog pages, coupon detail, code results, and received-coupon history.
- [x] 1.3 Implement the Bonda HTTP adapter with separate affiliate and coupon credentials, bounded requests, catalog pagination, response-size limits, and HTTP-200 error-envelope handling.
- [x] 1.4 Normalize Bonda HTML fields to safe customer text and allow only configured HTTPS image hosts.
- [x] 1.5 Add deterministic fake Bonda adapters and documented response fixtures for development and automated tests.

## 2. Persistence and Carobra catalog policy

- [x] 2.1 Add an additive migration for Bonda partner coupon references, affiliate provisioning status, coupon-request audit records, indexes, constraints, and the disabled `V2_BONDA_COUPONS` feature flag.
- [x] 2.2 Implement repositories for idempotent affiliate status, retry scheduling, safe failure state, coupon request lifecycle, and received-history reconciliation.
- [x] 2.3 Extend catalog policy validation for Bonda free coupons with stable partner identifiers, minimum V2 level, cumulative access, and deterministic display order.
- [x] 2.4 Add a reconciliation query or command that reports proposed brand matches, missing Bonda coupons, duplicate names, changed content, and expired items without publishing them automatically.
- [x] 2.5 Test migrations, constraints, policy versioning, repository replay behavior, and safe persistence metadata.

## 3. Affiliate provisioning lifecycle

- [x] 3.1 Connect successful registration to Rewards-ID-only Bonda provisioning with `send_welcome_email=false` and no additional customer fields.
- [x] 3.2 Preserve successful Carobra registration on Bonda failure and expose a safe pending-benefits state.
- [x] 3.3 Implement bounded retry processing, existing-affiliate recovery, action-required failures, lazy recovery on authenticated benefits access, and an operations backfill for existing customers.
- [x] 3.4 Add unit and application tests for success, duplicate affiliate, timeout, retry, missing token, invalid credentials, and recovery after partial local failure.

## 4. Authenticated coupon application

- [x] 4.1 Implement the customer catalog query as the intersection of live Bonda content, enabled Carobra policy, canonical V2 journey state, and cumulative level rank.
- [x] 4.2 Add authenticated site-backend routes for paginated catalog, coupon detail, affiliate status, code request, and recent coupon history.
- [x] 4.3 Revalidate current level and partner availability before every code request and guarantee that coupon operations never call or mutate the points ledger.
- [x] 4.4 Persist safe code-request outcomes, pass a non-sensitive local `external_id` when supported, and mark ambiguous timeouts for history-based verification instead of blind retry.
- [x] 4.5 Add contract and integration tests for Bronce-through-Titanio accumulation, Invitado/Inactive/Blocked denial, unapproved items, expired/missing items, partner errors, limits, exhausted inventory, and ambiguous code results.

## 5. Customer benefits experience

- [x] 5.1 Add frontend contracts and same-origin proxy allowlist entries for the new coupon endpoints without exposing Bonda configuration.
- [ ] 5.2 Integrate responsive level context, cumulative benefit cards, approved category/channel filters, and truthful empty/loading/unavailable states into the Carobra redesign without importing the discarded prototype styling.
- [ ] 5.3 Implement coupon detail and explicit code-request confirmation in the Carobra redesign with safe instructions, legal terms, expiration, code-copy behavior, and recent coupon history.
- [ ] 5.4 Present affiliate-pending, partner-unavailable, limit-reached, inventory-unavailable, and verification-required outcomes in plain customer language in the Carobra redesign.
- [ ] 5.5 Keep the redesigned gift-card page and point-redemption controls disabled and visually separate from free coupons.
- [ ] 5.6 Add accessibility, keyboard, mobile, desktop, contract, and end-to-end coverage for the redesigned experience using the fake Bonda adapter.

## 6. Catalog reconciliation and controlled activation

- [x] 6.1 Load the 25 proposed Bronce-through-Titanio discount brands from the approved presentation as disabled catalog candidates; add no Invitado coupons and exclude every gift card, including Despegar.
- [ ] 6.2 Complete catalog-owner review of the live reconciliation (7 exact brands, 2 duplicate offers, and 16 missing brands) and approve exact Bonda coupon identifiers, levels, order, and publication state.
- [ ] 6.3 Resolve alphanumeric Rewards ID compatibility, obtain an approved test environment, and run a non-customer end-to-end test covering provisioning, catalog access, cumulative level filtering, code request, error handling, and history.
- [ ] 6.4 Enable `V2_BONDA_COUPONS` only after the test gate passes; backfill affiliate provisioning in controlled batches and monitor pending/action-required counts.
- [x] 6.5 Document production rollout, catalog refresh/reconciliation, credential rotation, incident handling, feature-flag rollback, and confirmation that coupon activity leaves point balances unchanged.
- [x] 6.6 Add a bounded cache for previously validated public catalog content, expose freshness, and prohibit code issuance from cached availability.
