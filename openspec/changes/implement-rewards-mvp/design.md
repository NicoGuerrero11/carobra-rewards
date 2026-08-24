## Context

The repository separates an existing FastAPI service, a Node site backend, and an Astro SSR frontend. FastAPI already owns registration, login, session handling, the minimal SISCA consultation using CURP, and persistence of Carobra's customer and validation facts in Carobra's Neon database. SISCA has no access to that database or to Rewards; its participation ends when it returns the requested validation information. The Node site backend will own the Rewards application and its tables in Carobra's Neon database. Rewards pages imported from the original demo exist but are intentionally hidden and use browser `sessionStorage` rather than persisted business data.

The MVP definition covers points, primary behaviors, referrals, benefits, redemptions, Skandia and Qualitas cross-selling, product-restricted value, advisor compensation, expiration, and financial controls. Several commercial inputs are not final. The design must therefore support the complete domain while allowing rules, catalog items, and adapters to remain disabled until their values and evidence sources are approved.

Stakeholders include customers, product and commercial teams, finance, operations, advisors, partner-product owners, and the engineering team. The discovery decisions and product questions are recorded in `docs/rewards-mvp-exploration.md`.

## Goals / Non-Goals

**Goals:**

- Provide a functional, site-backend-backed Rewards experience only to customers with validated, active AFORE service.
- Preserve a clearly separate validation experience for authenticated customers who are not eligible.
- Make every point issuance, consumption, expiration, refund, and adjustment idempotent, auditable, and concurrency-safe.
- Represent the complete MVP behavior and product model without hard-coding unresolved commercial values.
- Keep universal points, free entitlements, and restricted product wallets as distinct financial instruments.
- Support controlled inventory and atomic redemption without overspending points or overselling rewards.
- Preserve the existing FastAPI registration/login/SISCA boundary, make the Node site backend the source of truth for Rewards, and keep the browser free of authoritative Rewards state.
- Deliver a responsive customer experience grounded in the approved information hierarchy: balance, validity, ways to earn, benefits, movements, and redemptions.

**Non-Goals:**

- Inventing final catalog prices, partner inventory, Qualitas activation rules, monthly redemption limits, or qualifying monthly actions before business approval.
- Treating the 100-points-to-1-MXN reference as cash convertibility.
- Activating partner benefits without a configured adapter and approved commercial agreement.
- Replacing partner administration, payment, accounting, or commission systems of record.
- Introducing an unapproved loyalty-level system.

## Decisions

### 1. Eligibility is a site-backend-enforced domain invariant

Rewards access requires the customer identity authenticated by the existing API plus Carobra-owned persisted facts for customer status `ACTIVE`, SISCA validation `VALIDATED`, and an `ACTIVE` AFORE service relation in Neon. The site backend checks eligibility for every Rewards read and command. Frontend routing only adapts the experience; it is not the security boundary.

The API completes and persists SISCA validation without writing Rewards state. When the site backend observes validated evidence, it creates the unique Rewards account and issues the 2,000-point registration credit in one site-backend database transaction using deterministic idempotency. Retries, concurrent reads, and backfill therefore converge on one account and award without coupling SISCA availability to Rewards persistence.

The brief gap between SISCA validation and Rewards activation is handled by idempotent activation on the first eligible site-backend request plus a replay-safe backfill. This preserves the API boundary and avoids making SISCA validation depend on Rewards tables.

### 2. Rewards uses explicit domain boundaries

The site backend adds coordinated boundaries for:

- rewards accounts, events, point lots, and ledger entries;
- catalog, inventory, entitlements, redemptions, and fulfillment;
- referrals and permanence milestones;
- product contracts, restricted wallets, and cross-selling evidence;
- advisor attribution and compensation;
- operations, notifications, and reporting.

These boundaries use the customer identifier authenticated by the existing API and read only the necessary Carobra-owned validation facts from Neon; they do not modify API-owned customer identity or copy sensitive SISCA payloads. Site-backend application services remain independent from HTTP, PostgreSQL, schedulers, and partner clients through ports.

Alternative considered: one large rewards service and table set. It is simpler initially but would mix customer points with monetary product value and advisor compensation, making audit and later integration unsafe.

### 3. Points are an immutable ledger backed by expiring lots

Each award creates a `reward_event`, a positive immutable ledger entry, and a `point_lot` containing issued, remaining, and expiration values. Normal lots expire 18 months after issuance; campaign lots can use a versioned 90-day rule. Consumption allocates against the earliest-expiring available lots. Negative adjustments and refunds create compensating entries; history is never rewritten.

Account summaries may cache aggregate balances for read performance, but the cache is updated in the same transaction and can be rebuilt from the ledger and allocations. Database constraints and row locking prevent negative available balances and duplicate event issuance.

Alternative considered: storing only a mutable balance. It cannot explain expiration, FIFO consumption, refunds, or financial liability and is rejected.

### 4. All earning starts from normalized idempotent evidence

Every qualifying action becomes a `reward_event` with a source, event type, external or deterministic source ID, occurred time, customer, optional product/service context, safe metadata, and rule version. A uniqueness constraint on the source identity makes retries safe.

Automatic behaviors use the same award operation regardless of whether evidence arrives from SISCA activation, an authenticated site action, a scheduler, an internal API, or a future partner adapter. Disabled rules record no customer promise and issue no points.

Scheduled anniversaries, referral milestones, product permanence, expiration, and notifications use database-backed jobs with unique business keys rather than in-memory timers.

### 5. Behavior and commercial values are versioned configuration

Behavior rules define code, enabled state, point value, validity policy, evidence requirements, effective interval, and rule version. Catalog items and compensation policies follow the same effective-dated approach. Historical ledger entries retain the applied version.

The initial baseline contains the agreed point values. Rules whose evidence or value is unresolved remain disabled with an explicit reason. Configuration changes do not retroactively rewrite earned value unless an authorized adjustment operation is executed.

Alternative considered: environment variables for every rule. They are difficult to audit and cannot preserve historical versions, so business configuration is persisted and migrated or administered through authorized operations.

### 6. Monthly interaction requires an explicit qualifying action

A login alone does not award points. A monthly award requires a valid authenticated session plus one configured qualifying action, with a deterministic key containing customer, rule version, and business month. The business timezone is configurable and defaults only after team approval. Until the action catalog and timezone are approved, the rule remains disabled.

This prevents background session refreshes and repeated logins from generating points while preserving the team's intended “login + action” model.

### 7. Catalog and redemption are inventory-aware state machines

Catalog items specify mode (`FREE_ENTITLEMENT`, `POINTS`, or `PRODUCT_BENEFIT`), price when applicable, eligibility rule, availability interval, inventory mode, fulfillment mode, and enabled state. Controlled inventory tracks total, reserved, fulfilled, and released quantities.

A point redemption transaction locks the account and inventory, validates eligibility and monthly limits, reserves inventory, allocates FIFO point lots, creates ledger consumption, and records the redemption. State transitions are `PENDING`, `CONFIRMED`, `FULFILLED`, `CANCELLED`, `REFUNDED`, and optionally `WAITLISTED`. Cancellation releases inventory and creates compensating point entries when policy permits.

Alternative considered: consume points before fulfillment without inventory reservation. It exposes customers to paid-but-unavailable rewards and is rejected.

### 8. Product wallets are not points

Skandia PPR contributions and Qualitas discounts use a restricted product-wallet model with decimal amount, currency, product contract, vesting or release condition, and clawback state. They are displayed alongside benefits but excluded from the universal points balance and cannot be redeemed for cash or catalog rewards.

Product events can also award universal points when a versioned behavior rule requires it, such as 5,000 points for qualifying Skandia contracting or 12-month product permanence.

### 9. Referral and advisor attribution are independent

A referral records the referring customer, referred registration, attribution time, status, and milestone evidence. It enforces self-referral and duplicate-attribution protections and configurable monthly limits.

Customer referrals use a personal opaque invitation link. The link is reusable, does not expire, and contains no customer identifier or customer data. The site frontend captures its token from `/registro?ref=<token>`, and the site backend removes the token before forwarding the unchanged registration payload to FastAPI. After a successful registration, the site backend resolves the token and records the Rewards attribution using HMAC identity evidence. Referral progress shown to the referring customer contains only aggregate or anonymous milestone state and never identifies the referred customer.

Advisor attribution records who initiated a customer or product relationship separately from customer referrals. Compensation records preserve gross commission, advisor share, customer-benefit share, policy version, activity evidence, calculation status, and payment/export references. Customer-generated referrals do not create advisor referral compensation.

### 10. External integrations are adapters with safe replay contracts

AVE, Skandia, Qualitas, fulfillment, and compensation sources enter through authenticated internal APIs or adapters that validate schemas and map partner identifiers to normalized events. Raw credentials and sensitive payloads are not stored in generic metadata or logs. External source IDs are mandatory for replay protection.

An adapter can be absent while its domain model and rule remain present but disabled. Partner activation therefore does not require a ledger redesign.

### 11. Site-backend Rewards contracts remain resource-oriented

The site backend exposes authenticated resources for eligibility, account summary, earning opportunities, movements, catalog, redemptions, and product benefits. Commands cover qualifying site actions and redemption creation/cancellation. Internal authenticated operations cover partner events, adjustments, catalog/inventory management, and scheduled processing.

For identity and SISCA evidence, the site backend preserves the existing API-issued HTTP-only session and calls the current `/me` and validation contracts. For Rewards, it owns the database transaction and maps stable errors such as `rewards_not_eligible`, `insufficient_points`, `inventory_unavailable`, `monthly_limit_reached`, and `duplicate_event`. The browser never accesses Neon or the FastAPI service directly.

### 12. The customer experience separates eligibility before navigation

The frontend resolves profile, validation, and Rewards eligibility on the server:

```text
Authenticated customer
        |
        +-- not eligible --> /cliente/validacion
        |                     status and support only
        |
        +-- eligible ------> /cliente/recompensas
                              summary
                              como ganar
                              beneficios
                              movimientos
                              mis redenciones
```

The validated summary follows this responsive hierarchy:

```text
+-----------------------------------------------------------+
| Carobra Rewards | Resumen                                 |
+-----------------------------------------------------------+
| Saldo disponible | Próximo vencimiento | Meta sugerida    |
+-----------------------------------------------------------+
| Como seguir ganando        | Movimientos recientes        |
+-----------------------------------------------------------+
| Referidos: link personal para copiar y compartir          |
+-----------------------------------------------------------+
| Beneficios: disponibilidad, costo, inventario y progreso  |
+-----------------------------------------------------------+
```

The validated experience does not repeat the AFORE relation status because eligibility has already been resolved before rendering Rewards. Referral access is a single section in the summary containing only the reusable personal link and its copy action; referral points, totals, and progress are not presented as a separate customer area. The UI displays point expirations by lot, plain-language earning conditions, real inventory states, and product-wallet value separately. It does not use demo `sessionStorage`, fabricate rewards, or expose disabled partner benefits as available. Desktop and mobile behavior use the existing Carobra visual system and accessible semantic controls.

### 13. Financial and operational reporting is derived from authoritative records

Reports aggregate issued, available, reserved, consumed, expired, adjusted, refunded, and estimated-liability points by period, rule, campaign, and catalog item. The 60% expected-redemption assumption is a configurable reporting parameter, not a change to customer balances.

Administrative adjustments require an authorized actor, reason code, human explanation, correlation ID, and immutable audit record. Expiration alerts at 60 and 30 days are idempotent and retain delivery outcome without including sensitive customer data in logs.

## Risks / Trade-offs

- **[Large cross-cutting MVP]** → Implement in dependency-ordered slices, keep every capability in the shared model, and require passing contracts at each slice before exposing it.
- **[Commercial values change after implementation]** → Use effective-dated rule and catalog versions; keep unresolved rules disabled instead of inventing defaults.
- **[A customer is validated before Rewards activation is observed]** → Activate idempotently on the first eligible site-backend request, provide replay-safe backfill, and test concurrent observation.
- **[Concurrent awards or redemptions corrupt balances]** → Enforce database uniqueness, row locking, atomic allocations, and concurrency integration tests.
- **[Long-lived point liability is misreported]** → Preserve immutable lots and ledger records and separate accounting assumptions from customer balance logic.
- **[Partner messages arrive duplicated or out of order]** → Require source event IDs, retain occurred/received times, and make state transitions monotonic and replay-safe.
- **[Product wallets are mistaken for cash or points]** → Use separate tables, types, APIs, labels, and balance presentation.
- **[Advisor incentives enable abuse]** → Separate attribution sources, impose configurable volume limits, flag suspicious patterns, and require auditable compensation policy versions.
- **[Catalog inventory is unavailable after a customer pays]** → Reserve inventory and points atomically and support cancellation/refund compensation.
- **[Pending customers discover Rewards URLs]** → Enforce eligibility in API and SSR middleware and return stable non-eligible responses without account data.
- **[Scheduler downtime delays milestones or expiration]** → Use database due times and replay-safe batch jobs that catch up after restart.

## Migration Plan

1. Add site-backend-owned schema tables, constraints, indexes, baseline behavior-rule versions, and disabled partner rules without changing existing API registration/login/SISCA routes.
2. Deploy site-backend eligibility and account activation behind a feature flag; backfill an account and registration award for already validated AFORE customers using the same idempotent activation operation.
3. Enable read APIs and the separate eligible/pending SSR navigation; keep redemption commands disabled.
4. Enable ledger-backed automatic behaviors whose evidence is available and verify balances and scheduled jobs.
5. Load the approved catalog and inventory, then enable entitlement and redemption commands.
6. Enable referrals, AVE, Skandia, Qualitas, wallets, and advisor compensation adapter by adapter after contract tests and operational approval.
7. Enable expiration alerts, reporting, and operational adjustment tooling before broad customer rollout.

Rollback disables customer-facing Rewards commands and navigation while preserving all ledger and audit history. Schema downgrade is allowed only before production data exists; after activation, rollback uses forward fixes and feature flags rather than deleting financial history.

## Open Questions

1. What monthly redemption limit applies, and is it global, point-based, or per catalog category?
2. Which site actions qualify for the monthly interaction award, what business timezone defines the month, and when does the first month begin?
3. What verified source supplies date of birth?
4. Does onboarding completion require all three events, and which system confirms each event and the Cinepolis entitlement?
5. What source contract provides AVE events?
6. Does Qualitas use option A or B, and what points or discount value applies?
7. What are the cancellation, vesting, and clawback rules for each cross-sell product?
8. What systems provide Skandia and Qualitas contracting, status, and cancellation events?
9. What final advisor commission matrix and active-platform definition should the policy use?
10. Who owns catalog inventory, fulfillment, customer support, and manual exception approval?
11. Are existing points frozen, retained, or expired if an active customer later loses AFORE service?
12. Which items, prices, partner agreements, and initial inventory values will the final catalog document authorize?
