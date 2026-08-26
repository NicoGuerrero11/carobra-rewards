## 1. Customer shell and navigation

- [x] 1.1 Replace the authenticated shell destinations with Inicio, Beneficios, Ganar puntos, Productos, and Actividad while preserving route guards and account controls.
- [x] 1.2 Update desktop and mobile navigation active states, labels, icons, and deep-link behavior, keeping Gift Cards nested under Benefits.

## 2. Focused Rewards home

- [x] 2.1 Recompose the Rewards home around level/balance, one primary action, current benefits, next-level progress, and a bounded recent-activity summary.
- [x] 2.2 Remove repeated full product, action-center, document, history, help, and benefits modules from the home and add clear links to focused destinations.
- [x] 2.3 Preserve invited, blocked, inactive, unavailable, and maximum-level states with provider-neutral responsive copy.

## 3. Benefits and activity destinations

- [x] 3.1 Rebuild Benefits as a truthful hub for available, upcoming, and gated benefit families using only existing portal state.
- [x] 3.2 Update Gift Cards as a nested Benefits destination with balance/prerequisite context and a clear return path, without activating catalog or redemption.
- [x] 3.3 Add Ganar puntos using existing profile activity, action, permanence, movement, and feature-readiness data without introducing new earning rules.
- [x] 3.4 Add Productos using existing product status, level impact, customer-safe guidance, and advisor contact without introducing provider integration.
- [x] 3.5 Replace Activity browser-demo state with authenticated portal timeline and point-movement detail, including safe empty and unavailable states.

## 4. Verification and design review

- [x] 4.1 Update frontend contract and E2E tests for the new navigation, concise home, Benefits hierarchy, Ganar puntos, Productos, and authenticated Activity page.
- [x] 4.2 Run frontend checks, build, and E2E coverage for eligible and pending customer states.
- [x] 4.3 Review full-page desktop and 375-pixel mobile renders for Home, Benefits, Ganar puntos, Productos, Activity, and Gift Cards, correcting hierarchy, focus, overflow, and readability defects.

## 5. MVP product discovery

- [x] 5.1 Add a distinct Productos disponibles section for Skandia, Quálitas, and Modalidad 40, with customer-safe descriptions and product-specific advisor contact actions.
- [x] 5.2 Update E2E coverage and review the expanded Productos page at desktop and 375-pixel mobile widths.
