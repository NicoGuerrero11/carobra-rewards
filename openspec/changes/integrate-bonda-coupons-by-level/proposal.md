## Why

Carobra already owns customer identity, Rewards ID, levels, and the customer portal, but the benefits experience still shows placeholders and has no Bonda adapter. The approved first integration slice is the free coupon and discount catalog, presented cumulatively from Bronce through Titanio without involving points or gift cards.

## What Changes

- Add a server-side Bonda client for affiliate provisioning, coupon catalog reads, coupon detail, code requests, and received-coupon history without exposing credentials to the browser.
- Provision every newly registered customer in Bonda using only the Carobra Rewards ID and no Bonda welcome email.
- Keep Carobra registration successful when Bonda is unavailable, persist a `PENDING` affiliate state, and support safe retries until provisioning succeeds.
- Add a Carobra-owned, versioned mapping from Bonda coupon identifiers to minimum Rewards levels and display order. Access is cumulative across Bronce, Plata, Oro, Platino, and Titanio.
- Expose authenticated customer coupon contracts from the site backend and replace the benefits placeholder with responsive catalog, detail, code, history, loading, empty, and unavailable states.
- Separate free Bonda coupons from point redemption and gift cards so coupon visibility never reads or changes the points ledger.
- Keep Invitado without coupons or discounts in this phase. Courses and other possible Invitado benefits remain outside this change.
- Keep gift cards, the Bonda points API, the gift-card microsite, and Despegar outside this phase.
- Require an authenticated Bonda secret and a safe Bonda test environment before enabling live affiliate provisioning or customer code requests. The same delivered secret may be configured in the separate coupon-key and affiliate-token slots when Bonda grants both capabilities to it.

## Capabilities

### New Capabilities

- `bonda-affiliate-provisioning`: Rewards-ID-only affiliate creation, durable status, retry behavior, and safe external error handling.
- `bonda-coupon-catalog`: Bonda coupon retrieval, Carobra-owned cumulative level access, normalized customer contracts, code requests, and coupon history without points effects.

### Modified Capabilities

- `site-application-architecture`: Extend the V2-only BFF boundary so Bonda credentials and partner response normalization remain server-side while the browser uses same-origin authenticated contracts.
- `rewards-v2-canonical-runtime`: Separate free coupon availability from point-redemption eligibility and use the canonical V2 level as the source for catalog access.

## Impact

- **Site backend:** new Bonda configuration, HTTP adapter, affiliate provisioning state/retry, catalog curation query, customer routes, stable errors, and tests.
- **Database:** additive versioned Bonda coupon assignments, affiliate integration status, and safe coupon-use audit records; no point-ledger rewrite.
- **Site frontend:** live benefits catalog and code-use experience replacing the current placeholder while preserving the existing Carobra visual system.
- **FastAPI:** no new Bonda responsibility; it remains authority for registration, authentication, customer identity, and Rewards ID.
- **External systems:** Bonda Public API and Payroll/Affiliate API. Production activation requires `microsite_id`, authenticated secrets for both capabilities, identifier-format compatibility, and a completed safe end-to-end test.
