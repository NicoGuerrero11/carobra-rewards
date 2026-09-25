## MODIFIED Requirements

### Requirement: Customer navigation must reflect focused destinations
The authenticated customer shell SHALL present stable destinations for Inicio,
Beneficios, Ganar puntos, Productos, and Actividad, while Cuenta remains
available from the account menu. Every authenticated customer, including an
invited customer with pending, rejected, cancelled, or attention-required
validation, SHALL be able to open those destinations without a validation-based
redirect. Gift Cards MUST remain reachable as a benefits subdestination but
MUST NOT occupy a permanent top-level navigation position while the customer
catalog is unavailable.

#### Scenario: Customer navigates from Rewards home
- **WHEN** an authenticated customer opens the customer shell
- **THEN** the primary navigation exposes Inicio, Beneficios, Ganar puntos, Productos, and Actividad without a separate top-level Gift Cards item

#### Scenario: Invited customer moves between sections
- **WHEN** an invited customer follows each primary navigation destination
- **THEN** every destination loads its customer-safe invited experience without redirecting to Inicio or a validation-only page

#### Scenario: Customer follows an existing Gift Card deep link
- **WHEN** an authenticated customer opens the existing Gift Card route directly
- **THEN** the route remains customer-safe and provides navigation back to Benefits

## ADDED Requirements

### Requirement: Eligibility restrictions must apply to actions instead of informational routes
The customer site SHALL use authentication to protect customer routes and SHALL
apply validation, product, catalog, balance, and redemption eligibility at the
specific action or API boundary. It MUST NOT deny access to an informational
customer destination solely because the customer is not yet active or validated.

#### Scenario: Invited customer browses unavailable capabilities
- **WHEN** an invited customer opens benefits, earning, product, activity, or rewards information
- **THEN** the site loads the destination and truthfully marks unavailable actions without redirecting the customer

#### Scenario: Invited customer attempts redemption
- **WHEN** an invited customer attempts a product-dependent or redemption action
- **THEN** the server rejects or withholds that action according to eligibility while preserving access to the surrounding destination
