## Why

The simulated intake flow currently reuses an existing active AFORE customer by CURP alone and does not compare NSS before returning `ALREADY_ACTIVE`. In the Rewards-managed flow, CURP and NSS are immutable identity fields, so a new intake that reuses an existing active CURP with a different NSS must be recorded as a controlled conflict instead of being silently accepted.

## What Changes

- Add a controlled identity-conflict path for `POST /api/v1/customers/intake` when a new intake uses a CURP that already belongs to a customer with an active AFORE relation but the incoming NSS differs from the stored NSS.
- Define a specific controlled application error for that CURP/NSS conflict and map it to the stable safe `409` public code `curp_nss_conflict` with a generic message that does not expose CURP, NSS, compared values, payload contents, or internal details.
- Compare NSS only after the input-contract trimming already applied by the intake flow, treating it as canonical text without numeric conversion, without losing leading zeroes, and without introducing official validation or additional normalization.
- Preserve the mandatory decision order: resolve customer by CURP, inspect the AFORE relation, keep `CustomerServiceInconsistency` when the relation is missing, `INACTIVE`, or `ENDED`, compare NSS only when the relation is `ACTIVE`, return `ALREADY_ACTIVE` for the same NSS, and finish as `IDENTITY_CONFLICT` for a different NSS.
- Persist the conflicting intake transactionally for traceability, preserve its `original_payload`, store exactly `{"reason": "curp_nss_conflict"}` in `processing_details`, keep the existing customer and Rewards ID unchanged, commit that final intake state before producing the `409`, and replay the same `409` idempotently for the same `(source, external_request_id)`.
- Keep the current `ALREADY_ACTIVE` behavior only when the active-AFORE customer has the same NSS, ignoring individual or combined differences in name, email, phone, and postal code and without updating the customer.
- Preserve the current inconsistency handling for customers that lack an AFORE relation or whose relation is `INACTIVE` or `ENDED`, and do not introduce any customer-update, data-repair, onboarding, eligibility, or SISCA integration changes.
- Record that no migration is expected for `processing_status` because the current column is text-backed without a real database value restriction; only a minimal migration would be in scope if implementation later discovers an actual enforced whitelist.
- Add focused unit and HTTP contract tests for initial conflict persistence, exact metadata, idempotent conflict replay, absence of customer mutation, same-NSS `ALREADY_ACTIVE` with combined contact differences, AFORE-status precedence, safe `409` mapping, and lack of duplicate intake creation during replay.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `simulated-customer-intake-flow`: active-AFORE reuse must compare NSS, return a safe controlled `409` on CURP/NSS mismatch, keep same-NSS contact differences on the `ALREADY_ACTIVE` path, and preserve traceability for both outcomes.
- `customer-persistence-model`: intake persistence must support the dedicated final status `IDENTITY_CONFLICT` for the CURP/NSS mismatch path, preserve the new intake `original_payload`, and store only the exact opaque metadata `{"reason": "curp_nss_conflict"}`.

## Impact

- Affected code: the simulated intake application service, its controlled application errors, API error mapping for `POST /api/v1/customers/intake`, and the intake status enum used by the persistence model.
- Affected API: `POST /api/v1/customers/intake` gains one additional stable `409` error code for active-AFORE CURP/NSS conflicts, without changing request or success schemas.
- Affected persistence behavior: the flow records a new final `IDENTITY_CONFLICT` intake outcome for traceability without updating customers, creating duplicates, changing Rewards IDs, or replacing persisted conflict metadata or payloads during replay.
- Affected tests: application unit tests, HTTP integration tests, and focused error-mapping tests for the new conflict and same-NSS contact-difference behavior.
