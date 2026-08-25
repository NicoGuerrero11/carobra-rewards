## ADDED Requirements

### Requirement: Customer contracts must enforce provider abstraction
The site backend SHALL translate internal product and validation evidence into provider-neutral customer contracts. Customer-facing endpoints and pages MUST NOT include provider, source, source ID, checkpoint, request ID, raw evidence, or internal integration error fields.

#### Scenario: Customer portal serializes product detail
- **WHEN** the site backend returns product detail to an authenticated customer
- **THEN** the serialized response contains only customer-facing product type, status, dates, impact, and guidance

### Requirement: Internal and customer views must use separate projections
The system SHALL preserve detailed provider evidence for authorized operations and audit views while exposing a separately validated customer projection. Hiding a field in CSS or omitting it only in one page MUST NOT be treated as sufficient redaction.

#### Scenario: Operations investigates a validation case
- **WHEN** an authorized operations user opens an internal case
- **THEN** internal evidence remains available according to authorization while the corresponding customer response remains provider-neutral
