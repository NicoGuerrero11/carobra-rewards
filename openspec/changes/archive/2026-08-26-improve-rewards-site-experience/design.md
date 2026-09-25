## Context

The authenticated portal already has a V2-only server projection, responsive
layouts, customer-safe copy, and focused pages for benefits, courses, Gift
Cards, account, and notifications. Its current Rewards home nevertheless
renders nearly every available module in one document: journey, balance,
validation, primary action, level progress, profile activity, level ladder,
products, movements, account state, actions, documents, timeline, help, and a
benefits preview. The same concepts are repeated on destination pages, and the
mobile page becomes disproportionately long.

The redesign must use the existing `RewardsCustomerPortal` response and retain
the current API/site-backend authority boundaries. Catalog, benefits,
redemption, level, and product configuration remain disabled or enabled exactly
as the backend reports them.

## Goals / Non-Goals

**Goals:**

- Make the Rewards home a concise decision surface for level/balance, one next
  action, current benefits, next-level progress, and recent activity.
- Give the customer shell five stable destinations: Inicio, Beneficios, Ganar
  puntos, Productos, and Actividad, while retaining Cuenta in the account menu.
- Make Benefits a useful umbrella experience even when no external catalog is
  enabled, while keeping Gift Cards subordinate to that destination.
- Move complete timeline and movement detail to an authenticated Activity page
  backed by the portal projection.
- Reduce mobile reading distance and repeated content without removing access
  to information.

**Non-Goals:**

- Activating Bonda, Gift Cards, redemption, product providers, SISCA behavior,
  new point values, levels, referrals, renewals, or expiration rules.
- Adding new backend business data, persistence, or external dependencies.
- Rebranding Carobra or replacing the established visual system.

## Decisions

### 1. Treat the home as a summary, not a complete portal

The home will render a compact hero, one primary-action panel, a concise
next-level/benefits pair, and a bounded recent-activity summary. Products,
complete history, learning detail, and account help remain reachable through
focused destinations.

Alternative considered: keep all modules and add anchors. Rejected because it
does not solve duplicated content or mobile reading distance.

### 2. Use one server-owned portal response on every affected page

Rewards, Benefits, and Activity will render from `Astro.locals.rewardsPortal`
when middleware has loaded it, with the existing direct portal fetch as a safe
fallback. The Activity page will stop using `client-demo-state` and will
combine the portal timeline with safe movement detail for display.

Alternative considered: add a new aggregate endpoint for the redesign.
Rejected because the current portal projection already contains the required
data and a new endpoint would expand scope without changing customer behavior.

### 3. Make Benefits the umbrella and Gift Cards a nested category

The shell will no longer advertise Gift Cards as a permanent top-level route.
Benefits will present clear families and current availability. The existing
Gift Card route remains valid for deep links and future activation, but it is
reached from Benefits and communicates its gated state from existing module and
product signals.

Alternative considered: hide all benefit destinations until Bonda is enabled.
Rejected because customers still need a coherent explanation of current and
upcoming value without a dead-end top navigation item.

### 4. Preserve truthful progressive disclosure

Cards may explain categories, readiness, or customer-visible prerequisites but
MUST NOT invent brands, point prices, inventory, dates, or eligibility. Empty
and gated states remain useful by directing the customer to an available
action or back to the Rewards home.

### 5. Keep the visual system and reduce composition density

Existing type, colors, gradients, radii, and shell behavior will be reused.
Page-specific CSS will favor fewer large sections, shorter copy, compact
summary rows, and responsive stacking. Desktop and 375-pixel mobile screenshots
will be used to verify hierarchy and overflow.

### 6. Separate owned products from the commercial offer

Productos will keep the authenticated customer's confirmed product facts in a
dedicated section and add a visually distinct `Productos disponibles` section
for the MVP offer: Skandia, Quálitas, and Modalidad 40. Offer cards are
informational and route to advisor contact with product context. They do not
claim customer eligibility, quote a price, or create a product request in the
backend.

## Risks / Trade-offs

- [Customers may miss information removed from the home] → Preserve explicit
  links to Activity, Benefits, Ganar puntos, Productos, and Cuenta from each
  summary module.
- [A useful benefits page can accidentally imply availability] → Derive all
  availability language from existing portal/module state and keep unapproved
  details absent.
- [Legacy deep links may break after navigation changes] → Keep existing routes
  and redirect only retired aliases already covered by the site.
- [Activity entries from different projections may look duplicated] → Group
  timeline and point movements into labeled sections rather than merging
  records heuristically.
- [Visual simplification could reduce accessibility] → Preserve semantic
  headings, visible focus, status text independent of color, and no horizontal
  overflow at supported widths.

## Migration Plan

1. Update shell labels and destinations while retaining all route guards.
2. Replace the Rewards home composition using the existing portal projection.
3. Rework Benefits and Gift Cards as parent/child destinations.
4. Add focused Ganar puntos and Productos pages using existing portal data.
5. Replace Activity demo state with authenticated portal data.
6. Update contract/E2E assertions and validate desktop and mobile rendering.
7. Add the MVP commercial product cards and advisor contact paths.
8. Roll back by reverting frontend composition; no data migration or backend
   rollback is required.

## Open Questions

None block this frontend-only change. Future catalog contents and eligibility
remain outside its scope and will flow through existing backend flags and
contracts when approved.
