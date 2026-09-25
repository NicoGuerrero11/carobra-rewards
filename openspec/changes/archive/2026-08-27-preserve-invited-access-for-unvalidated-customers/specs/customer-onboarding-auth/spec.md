## MODIFIED Requirements

### Requirement: Customer status messaging must be provider-agnostic and preserve invited membership
The authenticated customer experience SHALL describe validation and product
status as Carobra-owned customer states. A registered customer without validated
active product evidence SHALL be presented as an invited Rewards member whether
the internal validation is pending, cancelled, rejected, or requires attention.
The experience MUST NOT display SISCA, provider names, evidence references,
checkpoints, request identifiers, raw integration errors, or an inactive/blocked
Rewards membership derived only from validation outcome.

#### Scenario: Customer waits for first-product validation
- **WHEN** the customer authenticates while internal validation evidence is pending
- **THEN** the portal presents the invited journey, states that Carobra is validating the product, and exposes no internal provider or checkpoint terminology

#### Scenario: Customer has a terminal negative validation
- **WHEN** the customer authenticates after product validation is cancelled or rejected and has no validated active product
- **THEN** the portal continues to present the invited Rewards journey with customer-safe guidance and unavailable product-dependent actions

#### Scenario: Internal provider reports a technical failure
- **WHEN** an internal validation request fails technically
- **THEN** the customer receives a stable invited or support message without the provider name, raw failure, or retry implementation details
