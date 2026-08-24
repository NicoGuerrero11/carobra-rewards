## ADDED Requirements

### Requirement: Customer status messaging must be provider-agnostic
The authenticated customer experience SHALL describe validation and product status as Carobra-owned customer states. It MUST NOT display SISCA, provider names, evidence references, checkpoints, request identifiers, or raw integration errors on customer routes.

#### Scenario: Customer waits for first-product validation
- **WHEN** the customer authenticates while internal validation evidence is pending
- **THEN** the portal states that Carobra is validating the product and exposes no internal provider or checkpoint terminology

#### Scenario: Internal provider reports a technical failure
- **WHEN** an internal validation request fails technically
- **THEN** the customer receives a stable Carobra status or support message without the provider name, raw failure, or retry implementation details
