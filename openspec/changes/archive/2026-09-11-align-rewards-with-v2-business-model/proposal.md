## Why

The original Rewards MVP awards points after SISCA activation and lacks a
first-class model for the new customer journey: an invited customer, business
levels, active products, profile-building activity, and controlled test
scenarios. The V2 rules can be built on the existing Rewards foundation, but
they must be explicit before the team connects SISCA and the new site journey
to production behavior.

## What Changes

- Add a V2 customer journey that creates an **Invitado** customer at
  registration, awards the agreed registration points, and keeps redemptions
  unavailable until a valid active product exists.
- Add a level engine independent from the points balance. It will calculate and
  retain the current level and its audit history from validated product facts,
  permanence, and qualifying profile activity.
- Introduce a product-fact lifecycle that treats SISCA validation as the first
  evidence source, supports future non-AFORE starting products, and only awards
  product-linked outcomes after configured acceptance/activation evidence.
- Add configurable, auditable profile activity and level thresholds, so the
  unresolved Plata rule is not hard-coded into the application.
- Expose a customer-journey API and redesign the authenticated Rewards site for
  Invitado, validation, level progress, active products, activities, points,
  cancellation, and reactivation states.
- Add backend-owned test scenarios and feature flags so the team can exercise
  the real site and contracts without using customer data or browser-only
  mock state.
- Preserve Bonda catalog/redemption, point expiry, AVE, referral channel, and
  renewal details as disabled/configurable extension points until their
  business decisions are approved.
- **BREAKING** Replace the MVP assumption that a customer must first become
  active through AFORE before receiving any Rewards state: registration now
  establishes the Invitado state and its registration award.

## Capabilities

### New Capabilities

- `rewards-v2-customer-journey`: Invited-to-active journey, redemption access,
  customer-facing journey summary, and state transitions.
- `rewards-level-engine`: Deterministic, auditable calculation of Bronce,
  Plata, Oro, Platino, and Titanio independent from wallet balance.
- `rewards-product-evidence`: Product facts, source evidence, activation,
  cancellation, reactivation, and future product-provider support.
- `rewards-profile-activity`: Configurable qualifying activities and progress
  aggregation for customer profiling and Plata eligibility.
- `rewards-test-mode`: Server-owned test accounts, reproducible scenarios, and
  feature gating for internal review.

### Modified Capabilities

- `customer-onboarding-auth`: A registered authenticated customer must receive
  an Invitado-aware status experience while SISCA validation is pending.
- `customer-persistence-model`: Customer persistence must retain the V2
  journey and product evidence without conflating it with identity or raw
  SISCA data.
- `sisca-validation-lifecycle`: A validated AFORE result must create the V2
  product evidence and trigger the configured first-product journey outcome.
- `site-application-architecture`: The site backend must own the V2 Rewards
  domain APIs and test-mode controls while the API remains authority for
  identity, authentication, and SISCA validation evidence.

## Impact

- **API:** registration, authentication, and SISCA validation remain in `api`;
  their successful validation outcome is exposed as safe product evidence.
- **Site backend and database:** add the V2 journey, level, product-evidence,
  profile-activity, configuration, and test-scenario models and APIs. Existing
  ledger records remain authoritative for points and are not rewritten.
- **Site frontend:** replace demo-only Rewards state with authenticated journey
  views driven by backend contracts.
- **External systems:** SISCA is the initial provider; Bonda and other product
  sources remain behind disabled/configurable adapters until approved.
- **Operations:** the decision backlog remains the source for open business
  questions; unresolved rules cannot activate customer-facing production
  behavior.
