## 1. Site-backend read path

- [x] 1.1 Add and test a projection-freshness guard that bypasses the V2 synchronization transaction for current pending and validated customers.
- [x] 1.2 Extend and test the customer portal contract with the already-loaded journey summary, activities, and movements.
- [x] 1.3 Preserve stale-evidence repair and direct journey/detail endpoint compatibility in application tests.

## 2. Site-frontend navigation

- [x] 2.1 Render the Rewards dashboard from one portal request and remove its overlapping journey, activity, and movement requests.
- [x] 2.2 Fetch protected profile and validation context concurrently and emit safe authentication, page-render, and total `Server-Timing` metrics.
- [x] 2.3 Enable Astro prefetch support and opt authenticated shell navigation links into hover prefetching.

## 3. Verification

- [x] 3.1 Update mock contracts and automated tests to assert the consolidated portal response and single dashboard request.
- [x] 3.2 Run site-backend type checks/tests and site-frontend checks, build, contracts, and end-to-end portal tests.
- [x] 3.3 Measure local authenticated navigation, record before/after request evidence, and review the final diff for unrelated changes.
