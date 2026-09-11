## ADDED Requirements

### Requirement: Product facts must be provider-neutral and evidence-backed
The system SHALL record product facts separately from the customer with a
provider, product type, lifecycle status, effective timestamps, source
reference, and safe source evidence. SISCA validation is the initial AFORE
evidence source; the model MUST support a future customer beginning with a
non-AFORE product.

#### Scenario: SISCA validates an AFORE product
- **WHEN** SISCA produces a valid accepted AFORE result
- **THEN** the system records or activates one AFORE product fact with its SISCA evidence reference

### Requirement: Only accepted active evidence may trigger product outcomes
The system SHALL award product-linked points or recalculate a product-linked
level only after the product fact satisfies the configured accepted and active
evidence criteria. A signed, pending, rejected, or unverified product MUST NOT
trigger those outcomes.

#### Scenario: A product is signed but never activated
- **WHEN** a provider records a product signature without active acceptance evidence
- **THEN** the system records the status without issuing the product award or changing level

### Requirement: Product lifecycle changes must recalculate the journey safely
The system SHALL process activation, cancellation, ending, and reactivation as
idempotent product-fact transitions. Each effective transition SHALL request a
level evaluation without deleting prior evidence or customer identity.

#### Scenario: Customer cancels their only active product
- **WHEN** the customer's final active product ends
- **THEN** the system preserves the customer history and records a recalculated journey outcome

