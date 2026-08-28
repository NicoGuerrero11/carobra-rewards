## Why

Customers whose first product is still pending, rejected, cancelled, or requires
manual attention are currently projected as inactive and the site redirects
them away from most customer destinations. This contradicts the Rewards V2
business model: until a product is validated, the customer remains an
`INVITED` Rewards member with browse access, while only product-dependent or
redemption actions stay unavailable.

## What Changes

- Preserve `INVITED` as the customer-facing Rewards journey for every customer
  without validated active product evidence, including negative or terminal
  validation outcomes.
- Keep validation outcomes available for operations and audit without using
  them to present or route the customer as an inactive Rewards member.
- Allow invited customers to navigate between Inicio, Beneficios, Ganar puntos,
  Productos, Actividad, and account destinations without global redirects.
- Gate individual capabilities such as redemption using server-owned
  eligibility and product evidence rather than blocking whole sections.
- Correct legacy eligibility classification so `PENDING_VALIDATION` is not
  described as `customer_inactive`.
- Add regression coverage for pending, rejected/cancelled, attention-required,
  and active customer navigation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sisca-validation-lifecycle`: Negative and unresolved validation outcomes must
  preserve the customer-facing invited journey while retaining their internal
  validation evidence.
- `customer-onboarding-auth`: Authenticated customers without a validated
  product must receive a stable invited-facing status rather than an inactive
  account presentation.
- `rewards-customer-site-experience`: Invited customers must be able to browse
  every customer destination, with restrictions applied to actions instead of
  routes.

## Impact

- API validation-to-customer status transitions and V2 journey synchronization.
- Site backend eligibility and V2 customer portal projection.
- Site frontend middleware, customer navigation, and validation/rewards pages.
- Unit, contract, and Playwright coverage for customer states and navigation.
