## Why

The authenticated Rewards portal is visually polished but spreads the customer's
current level, next action, activity, history, and unavailable benefits across a
very long dashboard with repeated messages. The site now needs a clearer
information architecture that prioritizes what the customer can do today while
remaining truthful about benefits and business rules that are not enabled.

## What Changes

- Reorganize the authenticated customer shell around `Inicio`, `Beneficios`,
  `Ganar puntos`, `Productos`, and `Actividad`, with Cuenta retained in the
  account menu and Gift Cards contained inside the benefits experience instead
  of occupying a permanent top-level destination.
- Refocus the Rewards home on four decisions: current level and balance, one
  primary action, benefits available now, and concrete progress toward the next
  level.
- Remove repeated product, history, activity, and benefits explanations from the
  home and route customers to focused detail pages for each concern.
- Replace the benefits holding page with a useful benefits hub that distinguishes
  available, upcoming, and level- or configuration-gated experiences without
  fabricating catalog inventory, brands, prices, or eligibility.
- Add focused Ganar puntos and Productos destinations that organize existing
  profile activities, permanence, product facts, level impact, and advisor
  contact guidance without introducing new earning or product rules.
- Present the MVP commercial offer for Skandia, Quálitas, and Modalidad 40 in
  Productos as an informational discovery surface with an advisor-contact call
  to action, without implying automatic eligibility or online contracting.
- Replace the browser-demo activity history with the authenticated portal
  projection and make it the focused destination for customer-safe timeline and
  point activity.
- Improve narrow-screen information density, navigation, heading hierarchy, and
  action placement while retaining accessible, provider-neutral customer copy.
- Preserve all existing V2 business rules, API boundaries, feature flags, and
  server-owned data. This change does not activate Bonda, Gift Cards, new product
  integrations, SISCA behavior, points, levels, or redemption policy.

## Capabilities

### New Capabilities

- `rewards-customer-site-experience`: Customer-shell navigation, focused Rewards
  home composition, responsive information hierarchy, and truthful cross-page
  routing.
- `rewards-benefits-experience`: Benefits hub, nested Gift Card discovery, and
  available/upcoming/gated presentation driven only by existing portal state.

### Modified Capabilities

- `rewards-customer-action-center`: The portal home presents one dominant next
  action and avoids duplicating the same assignment elsewhere on the page.
- `rewards-customer-history`: The home exposes only a bounded recent summary and
  routes complete authenticated activity and movement history to a focused page.

## Impact

- **Site frontend:** customer shell navigation, Rewards home, benefits, Gift
  Cards, activity, courses, and account entry points will be reorganized and
  visually refined.
- **Site backend contracts:** no new business authority or external integration
  is introduced; existing `RewardsCustomerPortal` data remains the source for
  journey, actions, products, movements, timeline, benefits, and learning state.
- **Tests:** customer portal, eligibility, navigation, accessibility, desktop,
  and mobile coverage will be updated for the new hierarchy.
- **External systems:** no changes to SISCA, Bonda, product providers, or
  fulfillment.
