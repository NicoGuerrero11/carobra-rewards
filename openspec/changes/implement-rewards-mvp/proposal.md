## Why

Carobra Rewards currently registers customers and validates their AFORE service through SISCA, but it does not yet provide the points, behaviors, benefits, cross-selling, redemption, advisor-compensation, or financial-control capabilities defined for the MVP. Building those capabilities now establishes a usable customer experience and a stable domain foundation while product values, partner agreements, and catalog details continue to evolve.

## What Changes

- Gate all Rewards capabilities behind a validated SISCA case, an `ACTIVE` customer, and an `ACTIVE` AFORE service relation, while preserving a separate authenticated validation-status experience for customers who are not yet eligible.
- Create an idempotent Rewards account when SISCA validation activates the customer and issue the agreed 2,000-point registration award only after activation.
- Add an immutable points ledger with expiring credit lots, FIFO consumption, adjustments, refunds, campaign validity, and safe concurrent balance calculations.
- Model and award every primary MVP behavior: onboarding completion, monthly site interaction, birthday, 6/12/18-month anniversaries, and voluntary AFORE contributions.
- Add customer referrals and their registration, 6-month, and 12-month milestones with anti-abuse controls.
- Add a catalog that supports free entitlements, point-priced rewards, unlimited or controlled inventory, campaign quotas, waitlists, and partner-dependent availability.
- Add atomic redemptions, inventory reservation, fulfillment state, cancellation, refund, and monthly-limit enforcement.
- Model Skandia and Qualitas cross-selling, product permanence, restricted product wallets, discount/commission transfers, and clawback-safe lifecycle handling.
- Add advisor attribution, anti-chapulineo rules, auditable compensation splits, activity-dependent commission rules, and suspicious-volume controls.
- Add expiration notifications, customer movement history, operational adjustments, inventory administration, and financial reporting for issued, available, reserved, consumed, expired, and estimated-liability points.
- Replace the hidden browser-only Rewards demo state with authenticated site-backend-backed customer pages for summary, ways to earn, benefits, movements, and redemptions.
- Keep product values that remain under team review, including the monthly redemption limit, qualifying monthly actions, Qualitas activation option, and final catalog inventory, as versioned configuration or disabled rules rather than hard-coded assumptions.

## Capabilities

### New Capabilities

- `rewards-account-eligibility`: SISCA-gated Rewards account activation, access control, and ineligible-customer behavior.
- `points-ledger-lifecycle`: Immutable point credits, balances, expiration, FIFO consumption, adjustments, and idempotency.
- `reward-earning-behaviors`: Primary AFORE-linked behaviors, scheduled milestones, monthly interaction, birthday, onboarding, and AVE awards.
- `reward-referrals`: Referral attribution, milestone awards, eligibility, and anti-abuse constraints.
- `benefit-catalog-redemption`: Benefit catalog, eligibility, inventory, waitlists, atomic point redemption, fulfillment, cancellation, and refund.
- `product-cross-selling-wallets`: Skandia and Qualitas product events, permanence awards, restricted product wallets, discounts, and clawbacks.
- `advisor-attribution-compensation`: Advisor/customer/product attribution, commission splits, activity rules, limits, and audit history.
- `rewards-customer-experience`: Authenticated responsive customer navigation and pages for balance, earning, benefits, movements, and redemptions.
- `rewards-operations-reporting`: Expiration notifications, administrative adjustments, operational controls, and financial liability reporting.

### Modified Capabilities

- `sisca-validation-lifecycle`: The existing API must remain limited to registration, login, SISCA consultation, and persistence of the minimal validated AFORE evidence required by the Carobra application.
- `customer-onboarding-auth`: Authenticated customers must receive an eligibility-aware customer experience instead of a single validation-only dashboard.
- `site-application-architecture`: The existing API remains the registration/login and SISCA adapter, the Node site backend becomes the Rewards business backend using Carobra's Neon database, and Astro remains the browser experience without authoritative business state.

## Impact

- **API:** preserve the existing registration, login, session, customer, and SISCA implementation; expose only the safe authenticated customer and validation evidence needed by the site backend, with no Rewards ledger, catalog, redemption, or compensation logic.
- **Site backend and Carobra Neon database:** own Rewards domain models, migrations, authenticated reads and commands, scheduled processing, and idempotent activation after observing validated SISCA evidence.
- **Site frontend:** eligibility-aware routing plus responsive summary, earning, catalog, movement, and redemption experiences; removal of production reliance on demo `sessionStorage` state.
- **External systems:** future or configured adapters for AFORE voluntary contributions, Skandia, Qualitas, fulfillment providers, email notifications, and advisor compensation sources.
- **Operations and finance:** configurable behavior/catalog values, controlled inventory, adjustment audit trails, expiration processing, and liability-focused reporting.
- **Testing:** site-backend domain, persistence, migration, concurrency and contract tests; unchanged API registration/login/SISCA regression tests; scheduler and desktop/mobile end-to-end coverage.
