## ADDED Requirements

### Requirement: CURP linked to an active AFORE customer with a different NSS must end as a controlled conflict
If the external request key is new, the normalized CURP already belongs to a
customer with an `ACTIVE` relation to the `AFORE` service, and the incoming NSS
differs from the stored customer NSS after the input-contract trimming already
defined for NSS, the system SHALL persist the new intake for traceability,
associate it with the existing customer identity resolved by CURP, preserve the
accepted `original_payload`, set the intake state to `IDENTITY_CONFLICT`, set
`processed_at` in UTC, store `processing_details` exactly as `{"reason":
"curp_nss_conflict"}`, keep the existing customer row, Rewards ID, and AFORE
relation unchanged, commit that final intake outcome, and return a controlled
`409` response. That response SHALL use the stable public code
`curp_nss_conflict` and a generic safe message that does not expose CURP, NSS,
compared values, payload contents, or internal persistence details.

#### Scenario: Return safe 409 for active-AFORE CURP and different NSS
- **WHEN** a valid simulated payload has a new external request key, a CURP already linked to a customer with an `ACTIVE` AFORE relation, and an NSS different from the stored customer NSS
- **THEN** the system responds `409` with `detail.code = curp_nss_conflict` and finishes the new intake as `IDENTITY_CONFLICT`

#### Scenario: Persist conflicting intake without mutating customer identity
- **WHEN** the active-AFORE CURP and different-NSS branch is taken
- **THEN** the system stores the new intake with its own `original_payload`, `customer_id`, `processed_at`, exact `processing_details = {"reason": "curp_nss_conflict"}`, and terminal `IDENTITY_CONFLICT` status without creating or updating a customer, Rewards ID, or AFORE relation

#### Scenario: Replay committed identity conflict idempotently
- **WHEN** the same `(source, external_request_id)` is received again after the stored intake already ended as `IDENTITY_CONFLICT`
- **THEN** the system responds `409` with `detail.code = curp_nss_conflict` without creating or reprocessing another intake and without replacing `original_payload`, `customer_id`, `processed_at`, or `processing_details`

#### Scenario: Compare NSS as trimmed text only
- **WHEN** the active-AFORE reuse branch compares the incoming NSS against the stored customer NSS
- **THEN** the comparison uses the already-trimmed text value, preserves leading zeroes, does not convert NSS to a number, and does not apply official validation or extra normalization

#### Scenario: AFORE inconsistency takes precedence over NSS comparison
- **WHEN** a valid simulated payload resolves a customer by CURP but the AFORE relation is missing, `INACTIVE`, or `ENDED`
- **THEN** the system fails with `CustomerServiceInconsistency` before any NSS comparison occurs

## MODIFIED Requirements

### Requirement: CURP already linked to an AFORE customer must produce ALREADY_ACTIVE without creating duplicates
If the external request key is new, the normalized CURP already belongs to a
customer, that customer already has an `ACTIVE` relation to the `AFORE`
service, and the incoming NSS matches the stored customer NSS after the
input-contract trimming already defined for NSS, the system SHALL persist the
new intake for traceability, associate it with the existing customer, set the
intake state to `ALREADY_ACTIVE`, return the existing Rewards ID, and SHALL NOT
generate another Rewards ID, create another customer, create another AFORE
relation, or update the stored customer identity or contact data. Differences
in name, email, phone, and postal code SHALL be ignored in this path whether
they appear individually or in combination. The new intake SHALL preserve its
own `intake_request_id`, external key, original payload, reference to the
existing customer, `processed_at` in UTC, and `processing_details = NULL`.

#### Scenario: Reuse existing AFORE customer for a new external request with the same NSS
- **WHEN** a valid simulated payload has a new external request key, a CURP already linked to a customer with an `ACTIVE` AFORE relation, and the same NSS as the stored customer
- **THEN** the system responds `200` with `status = ALREADY_ACTIVE` and `replayed = false`

#### Scenario: Ignore contact-data differences on same-NSS ALREADY_ACTIVE reuse
- **WHEN** the active-AFORE reuse branch finds the same NSS but the incoming name, email, phone, or postal code differs from the stored customer values
- **THEN** the system finishes as `ALREADY_ACTIVE`, preserves the new intake `original_payload`, and leaves the stored customer unchanged
