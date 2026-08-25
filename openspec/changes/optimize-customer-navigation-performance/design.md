## Context

The authenticated site is Astro SSR. Every protected navigation currently validates the session and SISCA status sequentially before the page executes its own site-backend request. The Rewards dashboard then requests four overlapping endpoints. Each endpoint independently obtains the same API-owned profile and validation evidence, and both the journey and portal endpoints invoke the idempotent V2 synchronizer.

After V2 became canonical, the synchronizer runs for every read. Even when the projection is already current, it opens a transaction, executes `INSERT ... ON CONFLICT`, locks the account and journey with `FOR UPDATE`, attempts idempotent awards, and updates projection rows. Two dashboard requests perform that work concurrently against the same customer while the PostgreSQL pool permits five connections.

Registration already creates the invited projection, and the repository includes a canonical backfill for existing and validated customers. There is not yet a durable event-delivery contract from the API's SISCA scheduler to the site backend. This change must improve navigation without weakening API session authority or risking a validated customer remaining permanently stale.

## Goals / Non-Goals

**Goals:**

- Keep repeated authenticated reads out of V2 mutation transactions when persisted state already reflects current evidence.
- Reduce the dashboard to one complete Rewards projection request.
- Remove the sequential profile/status latency in Astro middleware.
- Expose request timing in response headers for local and deployed diagnosis.
- Prefetch authenticated navigation targets without changing authorization semantics.
- Preserve idempotency and allow one repair when API evidence is newer than the site-backend projection.

**Non-Goals:**

- Introduce a cross-service message broker, webhook secret, or transactional outbox.
- Change API ownership of identity, sessions, or SISCA evidence.
- Increase the PostgreSQL pool as a substitute for removing duplicate work.
- Redesign Rewards business rules, balances, levels, or customer-facing content.
- Convert the entire site to a client-side application router in this change.

## Decisions

### 1. Add a read-only freshness guard before V2 synchronization

`PostgresRewardsV2LiveJourney.synchronize` will first query a compact projection marker. Pending evidence is current when an invited-or-later journey and its registration award exist. Validated AFORE evidence is current when the matching product-fact event and product award exist and the journey is active with a calculated level. Only a missing or stale marker enters the existing transactional synchronizer.

The transactional implementation remains unchanged as the race-safe repair path. Concurrent stale requests can still reach it, but uniqueness constraints and row locks preserve correctness; subsequent requests take the read-only fast path.

Alternative considered: remove synchronization from all reads immediately. Rejected for this change because the API scheduler has no durable delivery mechanism to the site backend, so a customer validated after registration could remain stale until an operator runs backfill.

### 2. Return the already-computed dashboard data in the portal projection

The portal application already loads journey summary, activities, movements, and portal state concurrently. Its response will expose those safe projections instead of discarding them. The Rewards dashboard will consume only `/api/v1/rewards/portal`; separate detail endpoints remain available for focused consumers and compatibility.

Alternative considered: add a second dashboard-specific endpoint. Rejected because it would duplicate portal orchestration and contracts while the portal response is already an additive, customer-safe projection.

### 3. Parallelize middleware context and measure the SSR critical path

For protected routes, Astro middleware will start profile and validation-status requests together. Auth pages continue to request only the profile. The middleware will add a `Server-Timing` header containing authenticated-context, page-render, and total durations to responses that reach page rendering.

Alternative considered: cache identity or validation in browser storage. Rejected because the API-owned HTTP-only session and current server evidence must remain authoritative.

### 4. Prefetch only explicit authenticated navigation links

Astro prefetch support will be enabled and authenticated shell links will opt in with the hover strategy. Full-document SSR navigation remains the fallback and authorization still runs for every request.

Alternative considered: enable Astro View Transitions globally. Deferred because existing page scripts assume document-load execution and require a separate lifecycle audit before client routing is safe.

### 5. Test work reduction as behavior, not wall-clock thresholds

Regression tests will assert concurrency, one dashboard endpoint, freshness short-circuiting, timing headers, and prefetch attributes. Local browser measurements will be reported for evidence, but CI will not depend on brittle millisecond thresholds.

## Risks / Trade-offs

- [Freshness marker omits a required side effect] → Include journey state, level, product event, registration award, and product award in the guard; retain transactional tests for incomplete projections.
- [Two first requests still synchronize concurrently] → Keep the existing locking and idempotency constraints; this is bounded to stale evidence rather than every navigation.
- [Additive portal fields expose internal evidence] → Reuse existing safe journey/activity/movement contracts and run the portal forbidden-term contract assertion across the complete response.
- [Prefetch adds unwanted server traffic] → Opt in only on authenticated navigation links and use the hover strategy rather than viewport or prefetch-all.
- [Server timing reveals implementation detail] → Publish generic phase names and durations only; do not include customer identifiers, SQL, URLs, or evidence.

## Migration Plan

1. Deploy the site-backend freshness guard and additive portal contract with compatibility tests.
2. Run the existing V2 backfill dry-run and verify no failures; apply it before or with deployment where canonical data is incomplete.
3. Deploy the frontend dashboard consolidation, parallel middleware, timing headers, and explicit prefetch links.
4. Monitor total and phase timings plus API/database load during rollout.
5. Roll back frontend consolidation independently if rendering regresses; the additive backend contract remains compatible.
6. Roll back the freshness guard by removing its early return; the original transactional synchronization remains intact.

## Open Questions

- A later change should define durable API-to-site-backend delivery for SISCA transitions so all lazy repair can be removed from reads.
- Deployment-region alignment among Vercel, site-backend, API, and PostgreSQL still needs production configuration evidence.
