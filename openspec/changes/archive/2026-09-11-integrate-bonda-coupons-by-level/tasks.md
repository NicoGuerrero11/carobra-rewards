## 1. Read-only Bonda boundary

- [x] 1.1 Add fail-closed configuration for the Bonda base URL allowlist, microsite ID, coupon API key, technical catalog affiliate, timeouts, image hosts, and independent read/write feature gates without committing secrets.
- [x] 1.2 Define stable catalog, coupon-detail, image, brand, and branch contracts plus safe read error states.
- [x] 1.3 Implement the bounded Bonda HTTP read adapter with error-envelope handling and approved HTTPS image hosts.
- [x] 1.4 Keep affiliate provisioning, coupon-code requests, received history, and Bonda point operations disabled and outside the active customer contract.
- [x] 1.5 Add deterministic fake adapters and response fixtures for development and automated tests.

## 2. Catalog policy and reconciliation

- [x] 2.1 Add additive persistence for stable Bonda partner identifiers, minimum V2 level, cumulative access, deterministic order, and the independent `V2_BONDA_COUPONS` flag.
- [x] 2.2 Validate Bonda free-coupon catalog policies and omit all unapproved identifiers.
- [x] 2.3 Add reconciliation that reports exact matches, missing benefits, repeated brands, changed content, and expired items without auto-publication.
- [x] 2.4 Load the 25 proposed Bronce-through-Titanio brands as disabled candidates, with no Invitado coupons or gift cards.
- [x] 2.5 Complete catalog-owner review of the 2026-09-10 read-only reconciliation and publish the 12 approved exact Bonda coupon identifiers at their approved levels and order.

## 3. Authenticated read application

- [x] 3.1 Implement customer catalog as the intersection of approved Bonda identifiers, enabled Carobra policy, canonical V2 journey state, and cumulative level rank.
- [x] 3.2 Add authenticated same-origin routes for catalog, coupon detail, and optional branch content.
- [x] 3.3 Guarantee that catalog browsing neither calls Bonda write operations nor reads or mutates the points ledger.
- [x] 3.4 Read only approved identifiers with bounded concurrency, share in-flight work, cache validated public content, and defer branches from core detail.
- [x] 3.5 Add unit, contract, integration, and degraded-state coverage for levels, journey denial, partner errors, normalization, cache behavior, and branches.

## 4. Customer benefits experience

- [x] 4.1 Replace the placeholder with a responsive flat catalog using one compact accessible card per approved Bonda identifier and Carobra category filters.
- [x] 4.2 Add a dedicated detail route with original principal image, complete safe copy, instructions, channels, expiration, legal terms, optional brand content, and related eligible image cards.
- [x] 4.3 Add the compact accessible branch modal with a bounded lazy-loaded map, scrollable list, coordinate validation, keyboard dismissal, and responsive stacking.
- [x] 4.4 Format long normalized copy into paragraphs, detected steps, and restrained semantic emphasis without changing wording or re-enabling partner HTML.
- [x] 4.5 Keep code-generation/history controls, gift cards, and point redemption absent or truthfully unavailable.
- [x] 4.6 Remove redundant benefits heroes and unrelated promotions; replace Ganar puntos with Cursos Próximamente and move Ayuda beside Notificaciones with accessible tooltips.
- [x] 4.7 Add accessibility, keyboard, mobile, desktop, contract, and end-to-end coverage for the final Carobra experience.

## 5. Controlled read-only closure

- [x] 5.1 Confirm `990910001` is used only for catalog, detail, image, brand, and branch reads.
- [x] 5.2 Enable only the approved read-only catalog path and confirm affiliate provisioning and coupon-request flags remain disabled.
- [x] 5.3 Document catalog reconciliation, cache behavior, credential rotation, incident handling, rollback, and zero point-ledger effects.
- [x] 5.4 Run frontend, backend, and end-to-end verification and strict OpenSpec validation before sync and archive.
