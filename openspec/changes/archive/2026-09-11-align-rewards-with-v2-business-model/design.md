## Context

The repository already separates `api`, `site-backend`, and `site-frontend`.
The API owns registration, identity, authentication, customer records, and
SISCA validation. The site backend contains the existing immutable points
ledger and Rewards modules; the frontend contains an early customer experience
and demo-oriented states. The V2 business model introduces an invited state,
levels based on customer value, product lifecycle evidence, and profile
activity. Several commercial rules remain open and must not become accidental
production policy.

Stakeholders are the Rewards business team, SISCA operations, product/design,
and engineering. The decision backlog in `docs/rewards-v2-decision-backlog.md`
is the operational record for pending business decisions.

## Goals / Non-Goals

**Goals:**

- Add an additive V2 domain model without altering existing customer identity
  records or rewriting the points ledger.
- Make a level decision reproducible from auditable facts, not from frontend
  calculations or wallet balance.
- Support a working, authenticated site for internal review and controlled test
  scenarios before activating all external integrations.
- Keep unapproved commercial rules configurable and disabled by default.

**Non-Goals:**

- Defining Bonda benefits, costs, catalog, fulfillment, or point expiration.
- Choosing the final Plata activity threshold, renewal policy, referral channel,
  AVE, or inactive-account policy.
- Replacing the API's identity/session/SISCA ownership or migrating existing
  production data destructively.
- Treating browser storage or fabricated customer data as a test authority.

## Decisions

### 1. Separate facts, points, and levels

The V2 model has four independent concerns:

| Concern | Authority | Purpose |
| --- | --- | --- |
| Customer identity and SISCA validation | API | Registration, authentication, and safe validated AFORE evidence. |
| Product facts | Site backend | Product/provider state and source evidence used by V2 rules. |
| Points ledger | Existing Rewards ledger | Financially auditable credits, debits, and balance. |
| Level projection and history | Site backend | Current level, reasons, and historical transitions. |

The level evaluator consumes product facts, registration time, and qualifying
activity aggregates. It MUST NOT infer level from the points balance. This
avoids a redemption or an adjustment changing customer status.

Alternative considered: store the current level as a manually maintained field
on the customer. Rejected because cancellation, reactivation, and later product
sources would make it inconsistent and unauditable.

### 2. Use an evidence-based product lifecycle

`ProductFact` records a stable provider-neutral identity (`provider`, product
type, external reference where available), lifecycle state, effective dates,
and source evidence. SISCA creates the first AFORE fact. Future products can
arrive through separate adapters without changing level logic.

Only an accepted/active product fact from an approved evidence source may award
product-linked points or trigger a level transition. A signature alone is not
sufficient. Cancellation or ending a product emits a fact transition and
causes a full level recalculation.

Alternative considered: let each provider directly update the customer level.
Rejected because it duplicates business rules and cannot reliably handle
multiple products or cancellations.

### 3. Model the V2 journey as an explicit projection

Registration creates a V2 `INVITED` journey projection and a single,
idempotent registration award according to versioned configuration. A positive
SISCA result creates/activates the AFORE product fact and evaluates the journey
to Bronce. The user may see points but cannot redeem while their journey lacks
an active product.

The initial evaluation order is: active product count determines the
product-based level (Bronce/Oro/Platino/Titanio); Plata requires its configured
permanence and profiling rule. The evaluator records the inputs and reason of
every change. A definitive precedence table is required before production
activation, and test scenarios may explicitly set approved configuration.

### 4. Make open rules versioned configuration and feature gated

Point amounts, qualifying activity definitions, threshold values, provider
acceptance criteria, and production activation flags are server-owned,
versioned configuration. Configuration must be effective-dated and referenced
by the resulting award or level decision. No user-facing Bonda catalog,
expiration, AVE, referral, or renewal behavior may activate until its flag and
business configuration are approved.

Alternative considered: hard-code the currently known figures and patch later.
Rejected because the source documents already contain conflicting figures and
would make past behavior impossible to explain.

### 5. Test mode is server-owned and isolated

Internal test scenarios are explicit, authorized records or fixtures that use
test identities/tenants and return the same summary contract as production.
They support at least Invitado, Bronce, Plata, product-count levels,
pending-validation, cancellation, and reactivation. They must not write to or
query real customer records, and frontend `sessionStorage` cannot establish
their business state.

Alternative considered: retain only visual mock data in the browser. Rejected
because it cannot verify backend contracts, authorizations, or state changes.

### 6. Build against a shared journey summary contract

The site backend exposes an authenticated `RewardsJourneySummary` containing
safe identity display data, validation state, redemption eligibility, current
level, next-level conditions/progress, active products, and points summary.
The frontend uses this contract for real and test accounts. Detail endpoints
provide activities and movements as needed.

This permits frontend implementation to start after contract agreement while
SISCA adapters and later providers are completed in parallel.

## Risks / Trade-offs

- [Plata and level precedence are not finalized] → Keep evaluator disabled for
  production transitions beyond approved rules; model and test all inputs now.
- [SISCA validation timing differs from the older D5 lifecycle] → Preserve the
  existing lifecycle until the business team formally approves the V2 timing
  policy; expose its state without inventing a timeout outcome.
- [Provider data arrives duplicated or out of order] → Require idempotency keys,
  source references, immutable evidence, and transactional recalculation.
- [Existing V1 points code has different values] → Do not mutate historical
  ledger entries; create versioned V2 earning rules and reconcile the master
  point table before any production award changes.
- [Test controls accidentally reach production] → Require environment allowlist,
  explicit authorization, non-production data isolation, and feature flags
  defaulting to off.
- [Bonda becomes a premature dependency] → Keep redemption UI/modules disabled
  and expose no benefit availability until its commercial contract is settled.

## Migration Plan

1. Approve this change's contracts and resolve only the decisions required for
   the first production-enabled path.
2. Add additive database migrations for V2 facts, projections, configuration,
   audit history, and test scenarios; do not delete or reinterpret historical
   ledger data.
3. Release APIs and frontend views behind disabled feature flags, then validate
   with server-owned test scenarios.
4. Shadow-evaluate levels from real non-mutating evidence and reconcile results
   with operations before enabling customer transitions or V2 awards.
5. Enable registration-to-Invitado and SISCA-to-Bronce only after the approved
   reward values and acceptance criteria are configured; enable later modules
   independently.
6. Roll back by disabling V2 flags and stopping new V2 decisions. Preserve all
   evidence and audit history; do not delete customer or ledger records.

## Open Questions

- What exact activity types, count, and window define Plata, and how does Plata
  interact with customers who also have two or more active products?
- Confirm the production meaning of accepted, active, and SISCA-validated for
  every product source.
- Define degradation precedence, products that were signed but never active,
  Qualitas renewal, and Skandia continuation.
- Define the final treatment and timing of inactive invited accounts.
- Confirm Bonda commercial terms, points expiry, AVE, referrals, and the master
  points table before enabling those modules.
