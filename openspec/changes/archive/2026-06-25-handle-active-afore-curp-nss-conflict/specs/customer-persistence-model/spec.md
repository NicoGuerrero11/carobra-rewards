## MODIFIED Requirements

### Requirement: Intake requests must preserve processing state and details separately
The system SHALL store the primary processing outcome in `processing_status` and
SHALL store structured supporting details in nullable `processing_details`
JSONB. `processing_details` MAY contain missing fields, errors, reasons,
validations, eligibility outcome, and relevant processing metadata, but it MUST
NOT replace the primary status. When a normal application flow expects to
update the status of an existing intake request and that intake request does
not exist, the persistence contract SHALL fail explicitly instead of ignoring
the missing record. When a final intake outcome is `IDENTITY_CONFLICT`, the
stored `processing_details` SHALL be exactly `{"reason": "curp_nss_conflict"}`
and SHALL NOT duplicate CURP, NSS, compared identity values, or other personal
data because the accepted `original_payload` already preserves the incoming
request for traceability.

#### Scenario: Store structured processing details
- **WHEN** Rewards records an intake request with missing data or validation findings
- **THEN** the system stores the primary status in `processing_status` and the structured findings in `processing_details`

#### Scenario: Reject status update when expected intake does not exist
- **WHEN** a normal application flow attempts to update the status of an intake request that should exist within the transaction but no record is found
- **THEN** the persistence contract rejects the operation explicitly

#### Scenario: Keep successful processing details null
- **WHEN** a normal application flow persists a final successful intake outcome of `APPROVED` or `ALREADY_ACTIVE`
- **THEN** the persistence contract stores `processing_details` as null

#### Scenario: Keep conflict processing details exact and opaque
- **WHEN** a normal application flow persists a final `IDENTITY_CONFLICT` intake outcome for an active-AFORE CURP/NSS mismatch
- **THEN** the persistence contract stores `processing_details` exactly as `{"reason": "curp_nss_conflict"}` and does not duplicate CURP, NSS, or compared identity fields there

### Requirement: Persistence must use internal Rewards statuses without reusing SISCA catalogs
The system SHALL store internal statuses as text columns controlled by Python
enums and SHALL NOT use PostgreSQL ENUM in this first version. The initial
persistence statuses SHALL be:
`customer_intake_requests.processing_status`: `RECEIVED`, `PROCESSING`, `INCOMPLETE`, `NOT_APPROVED`, `NOT_ELIGIBLE`, `ELIGIBILITY_PENDING`, `APPROVED`, `ALREADY_ACTIVE`, `IDENTITY_CONFLICT`
`customers.customer_status`: `PENDING_ONBOARDING`, `ACTIVE`, `INACTIVE`, `BLOCKED`
`customers.onboarding_status`: `PENDING`, `COMPLETED`, `EXPIRED`
`customer_services.status`: `ACTIVE`, `INACTIVE`, `ENDED`

#### Scenario: Store approved customer with initial internal statuses
- **WHEN** an intake is approved and a customer is created
- **THEN** the customer starts with `PENDING_ONBOARDING`, onboarding starts with `PENDING`, and SISCA state catalogs are not reused as those internal statuses

#### Scenario: Store dedicated identity-conflict status without database value migration
- **WHEN** a Rewards-managed intake finishes because an active-AFORE CURP matches but NSS conflicts
- **THEN** the intake is stored with internal status `IDENTITY_CONFLICT` through the current text-backed persistence contract without requiring SISCA catalog reuse

#### Scenario: Keep replay of identity conflict on the same stored intake
- **WHEN** the same `(source, external_request_id)` is replayed after a prior intake already ended as `IDENTITY_CONFLICT`
- **THEN** the persistence state keeps the same intake row, `original_payload`, `customer_id`, `processed_at`, and `processing_details` without creating a duplicate intake row
