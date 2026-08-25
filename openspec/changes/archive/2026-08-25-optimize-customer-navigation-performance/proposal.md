## Why

Authenticated customer navigation became slow after Rewards V2 activation because every server-rendered page repeats identity and validation requests, while Rewards read endpoints synchronize and lock the customer journey during `GET` requests. The dashboard also requests overlapping projections independently, multiplying upstream API calls and PostgreSQL work on every page transition.

## What Changes

- Make the normal authenticated Rewards `GET` path read-only by short-circuiting journey synchronization when the persisted projection already represents the current API evidence; registration and the existing backfill remain the primary creation paths, while genuinely newer evidence is repaired once.
- Reuse one authenticated customer context per site-backend request instead of repeatedly retrieving profile and validation evidence for each projection.
- Consolidate the Rewards dashboard onto one portal projection instead of separately requesting journey, activities, movements, and portal data that overlap.
- Reduce middleware latency by retrieving profile and validation status concurrently while preserving API-owned session authority.
- Add server timing metadata and regression tests that expose the authentication, Rewards projection, and total render cost.
- Enable safe same-origin prefetching for authenticated navigation after the server critical path is reduced.

## Capabilities

### New Capabilities

- `customer-portal-performance`: Read-only Rewards projections, bounded authenticated page data work, server timing visibility, and responsive customer navigation behavior.

### Modified Capabilities

None.

## Impact

- **Site backend:** Rewards route orchestration, identity evidence reuse, journey synchronization boundaries, timing instrumentation, and regression tests.
- **Site frontend:** authenticated middleware, Rewards dashboard data loading, Astro navigation configuration, and browser tests.
- **API:** no ownership changes; it remains the authority for identity, session, and SISCA validation evidence.
- **Database:** no schema migration; existing backfill and event-driven synchronization paths remain responsible for creating canonical V2 projections.
- **Operations:** deployment must run or verify the V2 backfill before relying on pure read endpoints for existing customers.
