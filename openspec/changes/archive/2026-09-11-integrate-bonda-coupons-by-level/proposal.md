## Why

Carobra already owns customer identity, levels, and the customer portal, but the benefits experience still used placeholders. The approved first Bonda slice is a read-only catalog of free coupons and discounts, presented cumulatively from Bronce through Titanio without points, gift cards, affiliate provisioning, or coupon issuance.

## What Changes

- Add a server-side, read-only Bonda client for approved coupon catalog, detail, image, brand, and branch content without exposing credentials to the browser.
- Add a Carobra-owned, versioned mapping from stable Bonda coupon identifiers to minimum Rewards levels and display order. Access is cumulative across Bronce, Plata, Oro, Platino, and Titanio.
- Replace the benefits placeholder with a responsive Carobra catalog that renders one card per approved Bonda coupon identifier and navigates to a dedicated full-page detail.
- Format long normalized benefit copy into scannable paragraphs, steps, and restrained Carobra-colored emphasis without changing Bonda's wording.
- Avoid blocking pages on the full Bonda catalog or branch directory by reading only approved coupon identifiers, caching validated public content, and loading branches after the detail page is visible.
- Keep browsing independent from the points ledger and keep Invitado without coupons in this phase.
- Keep Bonda affiliate provisioning, coupon-code generation, received-coupon history, gift cards, the Bonda points API, the gift-card microsite, and Despegar outside this change. Existing dormant write-side infrastructure remains fail-closed and is not part of the delivered customer contract.

## Capabilities

### New Capabilities

- `bonda-coupon-catalog`: Read-only Bonda coupon retrieval, Carobra-owned cumulative level access, normalized detail, images, and branch information without points effects.

### Modified Capabilities

- `site-application-architecture`: Extend the V2-only BFF boundary so Bonda credentials and partner response normalization remain server-side while the browser uses same-origin authenticated read contracts.
- `rewards-v2-canonical-runtime`: Separate free coupon visibility from point-redemption eligibility and use the canonical V2 level as the source for catalog access.

## Impact

- **Site backend:** read-only Bonda configuration, HTTP adapter, catalog curation query, authenticated catalog/detail/branch routes, bounded cache, normalization, and tests.
- **Database:** additive versioned Bonda coupon assignments and supporting dormant integration tables; no customer, point-ledger, or external Bonda write is required by this change.
- **Site frontend:** live benefits catalog, rich detail pages, compact branch modal, and truthful loading, empty, and unavailable states in the Carobra visual system.
- **FastAPI:** no new Bonda responsibility; it remains authority for authentication, customer identity, Rewards ID, and registration.
- **External systems:** read-only Bonda Public API access through the approved technical affiliate `990910001`. Customer affiliate provisioning, code requests, and history require a separate future change and activation decision.
