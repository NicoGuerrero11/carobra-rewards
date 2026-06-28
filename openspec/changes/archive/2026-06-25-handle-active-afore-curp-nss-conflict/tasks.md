## 1. Active-AFORE Identity Decision

- [x] 1.1 Update the simulated intake application flow so the decision order is: resolve customer by CURP, inspect the AFORE relation, keep `CustomerServiceInconsistency` for missing, `INACTIVE`, or `ENDED` relations, compare NSS only for `ACTIVE`, return `ALREADY_ACTIVE` for the same NSS, and return the dedicated conflict outcome for a different NSS.
- [x] 1.2 Add a dedicated controlled application error for the active-AFORE CURP/NSS mismatch and map it in the API layer to `409` with the stable public code `curp_nss_conflict` and a generic safe message.
- [x] 1.3 Compare NSS as trimmed canonical text only, preserving leading zeroes and avoiding numeric conversion, official validation, or any additional normalization.
- [x] 1.4 Extend the internal intake status enum and persistence contract to support the terminal status `IDENTITY_CONFLICT` without changing request or success schemas and without adding a migration unless implementation discovers a real enforced value restriction on `processing_status`.
- [x] 1.5 Persist the conflicting intake transactionally with its own `original_payload`, `customer_id`, `processed_at` in UTC, and exact `processing_details = {"reason": "curp_nss_conflict"}`, while leaving the existing customer row, Rewards ID, and AFORE relation unchanged.
- [x] 1.6 Commit the final `IDENTITY_CONFLICT` intake before raising or translating the controlled `409`, and replay an existing `IDENTITY_CONFLICT` intake for the same `(source, external_request_id)` as the same safe `409` without creating a duplicate intake or modifying `original_payload`, `customer_id`, `processed_at`, or `processing_details`.
- [x] 1.7 Keep the current `ALREADY_ACTIVE` branch for same-NSS matches, explicitly ignore individual and combined differences in name, email, phone, and postal code, and do not update the stored customer in that path.
- [x] 1.8 Preserve the current `500` inconsistency handling for missing, `INACTIVE`, or `ENDED` AFORE relations and do not introduce any customer repair or synchronization flow in this change.

## 2. Focused Tests

- [x] 2.1 Add unit tests for the application use case covering an existing active-AFORE customer with the same CURP and different NSS, asserting the dedicated controlled error, terminal `IDENTITY_CONFLICT` persistence, exact `processing_details = {"reason": "curp_nss_conflict"}`, preserved `original_payload`, and absence of customer, Rewards ID, or AFORE relation mutation.
- [x] 2.2 Add unit tests proving that a first-time CURP/NSS conflict remains persisted after the `409` path completes and that replaying the same `(source, external_request_id)` returns the same `409 curp_nss_conflict` without creating or reprocessing another intake.
- [x] 2.3 Add or update focused API error-mapping tests so the new controlled error returns `409` with `detail.code = curp_nss_conflict`, a generic safe message, and no nested `detail.detail`.
- [x] 2.4 Add one HTTP integration test for `POST /api/v1/customers/intake` that seeds an active-AFORE customer, sends the same CURP with a different NSS, asserts the safe `409` body, verifies no double `detail`, and confirms the database keeps one customer, one active relation, and one newly persisted `IDENTITY_CONFLICT` intake with exact metadata.
- [x] 2.5 Add one HTTP or application-level replay assertion showing that a previously committed `IDENTITY_CONFLICT` intake returns the same safe `409`, preserves `original_payload`, `customer_id`, `processed_at`, and `processing_details`, and does not create a duplicate intake during replay.
- [x] 2.6 Add unit or HTTP assertions showing that same-NSS requests with combined differences in name, email, phone, and postal code still produce `ALREADY_ACTIVE` and do not update the stored customer values.
- [x] 2.7 Add explicit precedence tests showing that missing, `INACTIVE`, and `ENDED` AFORE relations still resolve as `CustomerServiceInconsistency` before any NSS comparison occurs.
