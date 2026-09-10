## Context

Carobra has three application boundaries: FastAPI owns identity, registration, sessions, and Rewards ID; the Node site backend owns Rewards V2 and the database; Astro renders the authenticated customer experience. The site backend already contains generic catalog, entitlement, and point-redemption foundations, but it exposes no customer catalog routes and has no Bonda configuration or adapter. The benefits page is currently a truthful placeholder.

Bonda exposes separate contracts for affiliate administration and coupons. Affiliate administration requires a microsite identifier and token. Coupon reads and code requests require the microsite identifier, API key, and affiliate code. A live read-only check confirmed that the single secret delivered to Carobra authenticates both contracts, so it can occupy both independently gated configuration slots. Bonda still needs to provide or approve a safe test environment before code-generation end-to-end testing.

A controlled live check also found that the current Bonda microsite rejects Carobra's alphanumeric `RWD-...` identifiers and accepts a numeric technical affiliate. Carobra SHALL NOT silently transform or replace its canonical Rewards ID. Live customer provisioning remains disabled until the Rewards ID format decision or Bonda microsite validation is resolved.

The approved business scope for this change is narrower than the older catalog model: free coupons and discounts begin at Bronce, each level adds benefits and preserves prior benefits, and Carobra controls the level mapping. Invitado receives no coupons or discounts in this phase. Gift cards, points synchronization, courses, and the gift-card microsite are separate future changes.

## Goals / Non-Goals

**Goals:**

- Integrate Bonda coupons without exposing partner credentials or partner-specific payloads to the browser.
- Provision Bonda affiliates with only the Rewards ID while preserving a successful Carobra registration during Bonda failures.
- Let Carobra curate the minimum level and display order for each Bonda coupon.
- Render live, normalized coupon data and request coupon codes from the Carobra site.
- Record safe operational evidence of provisioning and coupon-code requests without changing points.
- Support development with deterministic fakes before Bonda test credentials are available.

**Non-Goals:**

- Integrating gift cards, the Bonda points API, point conversion, or the gift-card microsite.
- Awarding points for viewing or using a coupon, including the unresolved usage bonus or reinvestment rules.
- Adding courses or other Invitado benefits.
- Letting Bonda calculate or store the authoritative Carobra level.
- Building the final operations administration interface; the first release uses versioned database configuration and a reconciliation report.
- Deleting or disabling Bonda affiliates when a Carobra account becomes inactive; customer coupon access remains denied by Carobra until that lifecycle policy is approved.

## Decisions

### 1. Keep Bonda behind a dedicated site-backend gateway

The Astro frontend calls authenticated same-origin Carobra routes. The site backend adds the Bonda API key, token, microsite identifier, timeouts, and allowlisted base URL. It validates and normalizes every Bonda response before returning a stable Carobra contract.

Direct browser-to-Bonda requests are rejected because they expose credentials, couple the UI to a legacy external schema, and make Carobra authorization impossible to enforce consistently.

### 2. Separate affiliate provisioning, catalog reads, and code requests

The adapter has three explicit ports:

- affiliate administration using the Payroll/Affiliate API;
- catalog and detail reads using the Public API;
- coupon-code requests and received-coupon history using the Public API.

This reflects Bonda's separate API contracts and permits independent rotation and activation even when Bonda authorizes the same secret for both. Live customer affiliate provisioning and customer code requests stay disabled until identifier compatibility and the test gate are satisfied.

### 3. Provision affiliates asynchronously and recover from partial failure

Successful Carobra registration is never rolled back because Bonda is unavailable. After FastAPI returns the committed customer and Rewards ID, the site backend creates or updates a durable provisioning record and attempts Bonda affiliate creation with:

```json
{
  "code": "<rewards_id>",
  "send_welcome_email": false
}
```

The record starts as `PENDING` and becomes `ACTIVE` after Bonda confirms the affiliate or a lookup confirms that the same Rewards ID already exists. Retryable failures remain `PENDING` with a next-attempt time and bounded exponential backoff. Invalid credentials or an identity conflict become `ACTION_REQUIRED`. Authenticated catalog access and an operations backfill can repair a missing provisioning record idempotently.

Alternative considered: make Bonda part of the registration transaction. Rejected because the two systems cannot share a transaction and an external outage would prevent valid Carobra registrations.

### 4. Use Carobra's catalog policy as an allowlist over live Bonda content

The existing versioned `catalog_items` model remains the Carobra policy authority. Bonda coupon items use `FREE_ENTITLEMENT`, `UNLIMITED`, `BONDA_COUPON_CODE`, and partner dependency `BONDA`. An additive partner-reference field stores the stable Bonda coupon identifier; the eligibility rule stores the minimum Carobra level and cumulative-access policy.

Bonda remains the content authority for the current discount, descriptions, legal terms, expiration, channels, images, and branch data. The customer catalog is the intersection of:

1. the current Bonda catalog for the microsite;
2. an enabled, effective Carobra catalog version;
3. the customer's canonical V2 level;
4. the cumulative level rule.

Matching by partner identifier is mandatory. Brand-name matching is used only by an operations reconciliation command because names can repeat or change.

### 5. Model cumulative access using an explicit rank

The rank is `INVITED=0`, `BRONZE=1`, `SILVER=2`, `GOLD=3`, `PLATINUM=4`, and `TITANIUM=5`. A customer sees an item when their current level rank is equal to or higher than the configured minimum. `INVITED`, `INACTIVE`, and `BLOCKED` journeys receive no coupon-code access in this phase.

The canonical V2 journey remains the only source of level. Bonda segmentation does not grant access and the points balance never participates in the decision.

### 6. Give free coupons an independent feature flag

Add `V2_BONDA_COUPONS` and expose `coupons_enabled` separately in the customer contract. The existing `V2_REDEMPTION` and `benefits_enabled` remain disabled for point-priced redemption and gift cards. Coupon listing and code requests never read, reserve, debit, or credit the points ledger.

### 7. Normalize unsafe and inconsistent partner responses

Bonda descriptions and legal text contain HTML. The adapter converts supported content to safe plain text for the first release and accepts images only from configured HTTPS hosts. It follows catalog pagination, applies response-size limits, and treats a successful HTTP status containing an `error` payload as a partner error.

Stable Carobra outcomes include `partner_unavailable`, `affiliate_pending`, `coupon_unavailable`, `coupon_limit_reached`, `coupon_inventory_unavailable`, and `coupon_request_needs_verification`. Raw partner messages, credentials, and full payloads never reach the browser or application logs.

### 8. Audit code requests without treating them as point redemptions

A dedicated coupon-request record stores customer, catalog item, Bonda coupon identifier, local request identifier, status, Bonda receipt identifier when present, timestamps, and safe result metadata. It stores no API credential and no unnecessary customer data.

Bonda does not document strong idempotency for code generation. Carobra therefore does not automatically repeat an ambiguous timed-out code request. It marks the request `VERIFICATION_REQUIRED` and reconciles it against Bonda's received-coupon history before allowing an operator-assisted retry. The optional Bonda `external_id` carries the non-sensitive local request identifier when supported.

### 9. Build and review the customer experience with a fake adapter first

Contract tests and the existing non-production scenario mode provide deterministic Bronce through Titanio catalogs, unavailable states, and code outcomes. No real Bonda call occurs unless the integration flag, environment allowlist, and required credentials are present.

The initial screen replaces the placeholder with level context, cumulative benefit cards, filters, detail content, code confirmation, recent coupons, and responsive states. Gift cards remain visibly separate and unavailable.

## Risks / Trade-offs

- [The Bonda microsite rejects alphanumeric Rewards IDs] → Keep live customer provisioning disabled; do not derive an undocumented numeric alias or send another customer identifier. Resolve the canonical Rewards ID decision or ask Bonda to accept the existing format.
- [No Bonda test environment is confirmed] → Prohibit automated tests against production and require an approved test base URL plus a non-customer Rewards ID before activation.
- [Presentation brands may not match current Bonda records] → The initial live reconciliation found 7 exact brands, 2 brands with duplicate offers, and 16 missing brands. Persist only catalog-owner-approved identifiers; never publish unmatched candidates.
- [Bonda catalog content changes without notice] → Render current partner content only for locally approved identifiers and report missing, expired, or changed items to the catalog owner.
- [A code request times out after Bonda created a code] → Do not blind-retry; reconcile received-coupon history and surface a verification state.
- [Bonda is unavailable during page load] → Use a short bounded cache for previously validated public catalog content and show its freshness; never issue a code from cache.
- [Direct image loading leaks browser requests to a partner asset host] → Allow only approved HTTPS hosts and retain an option to add a Carobra image proxy if privacy review requires it.
- [Existing generic entitlements assume an active account and one use] → Keep Bonda request auditing separate rather than forcing repeatable external coupons into the entitlement state machine.

## Migration Plan

1. Add disabled Bonda configuration and database structures without changing customer behavior.
2. Implement and test the adapter against fixtures captured from the documented response shapes.
3. Load proposed presentation brands as disabled catalog candidates and run reconciliation after credentials are configured.
4. Replace candidates with approved Bonda coupon identifiers and minimum levels for Bronce through Titanio.
5. Enable the catalog in an internal test environment using a Bonda test microsite and test Rewards ID.
6. Validate affiliate retry, cumulative level access, catalog disappearance, code success, Bonda business errors, and ambiguous timeouts.
7. Enable production affiliate provisioning, backfill existing eligible customers, then enable customer catalog reads and code requests gradually.

Rollback disables `V2_BONDA_COUPONS` and the affiliate worker. It preserves provisioning and request audit records, does not delete Bonda affiliates, and leaves the Carobra points ledger untouched.

## Open Questions

- Carobra must decide whether to retain the alphanumeric Rewards ID and request a Bonda validation change or adopt a numeric Rewards ID in a separate change.
- Bonda must confirm a safe test environment, test microsite, and test affiliate procedure.
- The catalog owner must resolve the 2 duplicate offers and the 16 missing presentation brands before publication; 7 brands currently have exact live matches.
- Bonda should confirm whether `external_id` can provide effective idempotency or reconciliation support for coupon-code requests.
