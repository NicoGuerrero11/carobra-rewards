## Context

FastAPI owns identity, registration, sessions, and Rewards ID; the Node site backend owns Rewards V2 and the database; Astro renders the authenticated customer experience. Bonda supplies coupon content through a partner API. A controlled read-only check confirmed that the approved technical affiliate `990910001` can retrieve catalog, detail, images, and branch data.

This change intentionally ends at that read boundary. It does not provision customer affiliates, generate coupon codes, or read received-coupon history. Those operations have different external effects, test requirements, and rollout risks and therefore require a later change. Any already-built write-side scaffolding remains disabled by configuration and is not part of the active product contract.

The business scope is free coupons and discounts beginning at Bronce. Each level adds benefits while preserving lower-level access. Invitado receives no coupons. Gift cards, points synchronization, courses content, and the gift-card microsite are separate future work.

## Goals / Non-Goals

**Goals:**

- Keep all Bonda credentials and partner payload normalization behind the site backend.
- Let Carobra curate exact Bonda identifiers, minimum levels, and display order.
- Render live, normalized catalog, detail, image, brand, and branch content.
- Keep catalog browsing independent from points and responsive under partner latency.
- Provide deterministic fake adapters and comprehensive contract/E2E coverage.

**Non-Goals:**

- Creating, updating, deleting, or backfilling Bonda affiliates.
- Generating coupon codes or reading a customer's received-coupon history.
- Integrating gift cards, Bonda points, point conversion, courses content, or Despegar.
- Letting Bonda determine the authoritative Carobra level.
- Publishing unmatched presentation brands or inventing missing partner content.

## Decisions

### 1. Keep Bonda behind a read-only site-backend gateway

The Astro frontend calls authenticated same-origin Carobra routes. The site backend adds the coupon API key, microsite identifier, technical catalog affiliate, timeouts, and allowlisted base URL. It validates and normalizes responses before returning a stable Carobra contract. The browser never receives Bonda credentials, raw payloads, or unrestricted partner URLs.

Write-side Bonda flags remain false. Catalog availability MUST NOT activate affiliate provisioning, code requests, history reads, or point operations.

### 2. Use Carobra policy as an allowlist over live content

Each published item stores the stable Bonda coupon identifier, minimum Carobra level, cumulative-access rule, and deterministic display order. Customer content is the intersection of:

1. the enabled, effective Carobra catalog version;
2. current Bonda content for the approved identifier;
3. the customer's canonical V2 level and active journey state.

Brand-name matching is used only for reconciliation. It never publishes an item automatically. Bonda remains the content authority for discount, description, instructions, terms, expiration, channels, images, brand information, and branches.

### 3. Use the technical affiliate only for public catalog reads

`BONDA_CATALOG_AFFILIATE_CODE=990910001` is a Bonda-approved, non-customer identity used only for catalog, detail, image, brand, and branch reads. It never represents the authenticated customer and cannot be reused by this change for affiliate provisioning, code issuance, or history.

### 4. Model cumulative level access explicitly

The rank is `INVITED=0`, `BRONZE=1`, `SILVER=2`, `GOLD=3`, `PLATINUM=4`, and `TITANIUM=5`. An active customer sees an item when their current level rank is equal to or higher than its configured minimum. Invitado, Inactive, and Blocked journeys receive no coupons. Points and Bonda segmentation do not participate.

### 5. Normalize partner content safely

The adapter converts supported partner HTML to safe text, accepts images only from approved HTTPS hosts, preserves principal/logo/landscape roles, validates finite branch coordinates in geographic ranges, follows bounded responses, and treats an HTTP 200 error envelope as an error. Raw HTML is never restored in the browser.

### 6. Render each Bonda coupon identifier as one card

Each approved identifier is one card, even when several identifiers share a brand. A single identifier that describes several advantages remains one card. The flat catalog does not group by level or distinguish inherited benefits. It offers a small Carobra category taxonomy with `Todos`, compact four-column desktop cards, responsive reductions, a large image, overlaid logo, prominent offer, short summary, channels, and a full-card accessible link.

The detail route shows the original principal image, complete normalized copy, instructions, expiration, channels, terms, optional brand information, and related eligible cards. It does not show code-generation or coupon-history controls. Long content is split into semantic paragraphs and detected steps, with restrained emphasis for percentages, important notices, contact information, validity, and restrictions.

### 7. Keep branch exploration compact and optional

`Sucursales disponibles` opens a bounded accessible modal. Desktop places a compact map beside a scrollable list; mobile stacks them. Invalid or missing coordinates do not hide an address. Map assets load only when needed, Escape and the close control dismiss the dialog, and focus returns to the trigger.

### 8. Optimize the bounded approved catalog

The application reads only approved identifiers through bounded concurrent detail requests, shares in-flight work, and caches validated public content for five minutes. Core detail renders before branch data. Branches prefetch after idle and the map library loads only when the modal needs it. Failed partner reads produce truthful unavailable states and never fabricated content.

### 9. Keep the customer shell focused

Primary navigation is Inicio, Beneficios, Cursos, Productos, and Actividad. Cursos is an honest `Próximamente` page. Ayuda and Notificaciones are accessible utility icons with hover/focus labels. The catalog omits unrelated promotional blocks.

## Risks / Trade-offs

- [Bonda content can change without notice] → Publish only exact locally approved identifiers, cache briefly, and reconcile missing, expired, or changed records.
- [The presentation includes brands absent from Bonda] → Keep them unpublished. The 2026-09-10 reconciliation found 12 approved identifiers and 16 missing presentation brands.
- [Branch directories may contain hundreds of rows] → Fetch them after core detail and lazy-load map assets.
- [Partner image requests reach approved asset hosts] → Enforce HTTPS host allowlists; add a Carobra proxy later if privacy review requires it.
- [Dormant write-side code could be enabled accidentally] → Keep provisioning and request flags false, exclude their routes/actions from the active UI, and require a separate reviewed change before activation.

## Migration Plan

1. Add fail-closed Bonda read configuration and additive catalog policy storage.
2. Load presentation candidates disabled and reconcile them against live read-only Bonda data.
3. Publish only catalog-owner-approved exact identifiers with minimum levels and order.
4. Enable only `BONDA_CATALOG_ENABLED` and `V2_BONDA_COUPONS` for the read-only customer experience.
5. Verify Bronce-through-Titanio accumulation, Invitado/non-active denial, details, images, branches, degraded states, cache behavior, and zero point-ledger effects.
6. Keep `BONDA_AFFILIATE_PROVISIONING_ENABLED=false` and `BONDA_COUPON_REQUESTS_ENABLED=false` until a separate activation change is approved and verified.

Rollback disables the catalog feature flags. It preserves catalog policy and cache-independent database records, performs no external deletion, and leaves customer identity and points untouched.

## Open Questions

- A future change must define and test customer affiliation, coupon issuance, received history, idempotency, and production rollout before any Bonda write is allowed.
- The catalog owner must decide whether to replace the 16 presentation brands absent from the current Bonda catalog.
