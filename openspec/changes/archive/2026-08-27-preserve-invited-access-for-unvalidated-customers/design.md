## Context

Rewards currently mixes three different state axes: the SISCA validation case,
the operational customer record, and the customer-facing V2 journey. A terminal
negative validation can set `customers.customer_status` to `INACTIVE`; frontend
middleware then interprets that operational value as a reason to redirect every
Rewards destination to `/cliente/validacion`. A legacy eligibility query also
classifies every status other than `ACTIVE`, including `PENDING_VALIDATION`, as
`customer_inactive`.

The V2 journey already has the correct customer-facing state boundary. A journey
starts as `INVITED` and becomes `ACTIVE` only after validated active product
evidence. Negative validation evidence does not need to erase the membership,
registration award, balance, or browse experience.

## Goals / Non-Goals

**Goals:**

- Make `INVITED` the customer-facing Rewards state whenever no active validated
  product exists, including pending, cancelled, rejected, and attention-required
  validations.
- Allow every authenticated invited customer to navigate across the customer
  site.
- Restrict redemption and other product-dependent actions at their decision
  boundary rather than at the route boundary.
- Preserve internal validation outcomes and operational evidence.
- Repair the legacy eligibility reason so pending is not synonymous with
  inactive.

**Non-Goals:**

- Reopen or retry terminal SISCA validation cases automatically.
- Treat rejected product evidence as validated or active.
- Enable redemption, catalog availability, or unapproved earning rules for
  invited customers.
- Change the existing 45-point invited registration award.

## Decisions

### 1. Separate validation, operational, and Rewards journey state

Validation status remains the authority for the SISCA workflow and audit.
Customer operational status may continue to record a terminal negative outcome,
but neither value will directly decide the customer-facing Rewards journey.
The V2 journey is `INVITED` until validated active product evidence promotes it
to `ACTIVE`.

This preserves evidence and avoids inventing a new database status. Changing a
cancelled validation back to `PENDING` was rejected because it would falsify the
provider workflow and could reschedule terminal work.

### 2. Use the V2 portal projection as the presentation authority

Customer pages will render the V2 journey returned by the authenticated portal.
Frontend fallbacks will default a missing non-active journey to `INVITED`, not
derive `INACTIVE` from the customer profile or legacy eligibility reason.

Keeping profile status as the presentation authority was rejected because it
recreates the coupling responsible for the regression.

### 3. Authenticate routes; authorize actions

Middleware will enforce authentication and the supported-route allowlist, but
will not redirect authenticated customers based on validation or customer
status. `/cliente` remains a canonical redirect to `/cliente/recompensas`.
Redemption and any product-dependent operation continue to use server-owned
eligibility at the action or API boundary.

This makes navigation stable while preserving business restrictions. Maintaining
route-level eligibility redirects was rejected because informational sections
such as Productos and Beneficios are part of the invited experience.

### 4. Keep legacy eligibility semantics accurate

The legacy query will return `sisca_not_validated` for `PENDING_VALIDATION` and
reserve `customer_inactive` for the explicit `INACTIVE` or `BLOCKED` operational
states. Although the V2 frontend no longer depends on this endpoint, correcting
it prevents other callers from repeating the same presentation error.

### 5. Cover journeys and real navigation

Unit tests will cover the eligibility reason mapping. Browser tests will log in
as pending, rejected/inactive, attention-required, and active customers and
visit every primary destination without being redirected. They will also assert
that invited customers still cannot perform unavailable actions.

## Risks / Trade-offs

- **[Risk] Operationally inactive customers can browse Rewards information.** →
  Keep every mutating or value-bearing operation protected by its own server-side
  eligibility rule; browse access alone grants no reward redemption.
- **[Risk] Existing UI copy may still say inactive on a secondary page.** → Add
  contract searches and browser assertions covering customer-visible status
  labels.
- **[Risk] Cached authenticated context briefly retains old data.** → The route
  decision no longer depends on the cached operational status, so no data
  migration or forced cache purge is required.
- **[Trade-off] Internal customer status and customer-facing journey can differ.**
  → This is intentional: they describe operational validation and Rewards
  membership respectively.

## Migration Plan

1. Deploy backend classification and frontend routing changes together.
2. Run unit, contract, and Playwright regression suites before promotion.
3. Verify one pending and one terminal-negative account can open every customer
   destination while redemption remains unavailable.
4. No database migration is required; existing V2 journeys remain `INVITED`.
5. Roll back the application release if an action authorization regression is
   observed; persisted validation evidence is unchanged.

## Open Questions

None for this correction. Future policy may define a separate membership closure
process, but validation rejection alone is not that process.
