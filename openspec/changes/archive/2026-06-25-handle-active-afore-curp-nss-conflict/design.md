## Context

The current simulated intake flow normalizes CURP, looks up an existing customer by that value, and reuses the customer whenever an active AFORE relation exists. That reuse path returns `ALREADY_ACTIVE` without checking whether the incoming NSS matches the immutable NSS already stored for that customer. The current flow also preserves each accepted request `original_payload`, already exposes controlled `409` errors through the intake API envelope, and persists intake statuses in a text-backed `processing_status` column (`String(32)` / `VARCHAR(32)`) with no PostgreSQL `ENUM`, `CHECK`, or other database-level whitelist discovered in the current model and migration.

This change is intentionally narrow. It only refines the decision tree for the active-AFORE CURP reuse branch, adds the dedicated final intake status `IDENTITY_CONFLICT` for that branch when NSS conflicts, and locks the safe HTTP contract, replay semantics, and traceability requirements around that outcome.

## Goals / Non-Goals

**Goals:**
- Compare incoming NSS against the stored customer NSS before reusing an existing active-AFORE customer.
- Compare NSS as canonical text after the existing input-contract trimming only, without numeric conversion, without dropping leading zeroes, and without additional normalization or official validation.
- Enforce the decision order: resolve customer by CURP, inspect AFORE relation, keep `CustomerServiceInconsistency` for missing, `INACTIVE`, or `ENDED` relations, compare NSS only for `ACTIVE`, return `ALREADY_ACTIVE` for the same NSS, and finish as `IDENTITY_CONFLICT` for a different NSS.
- Return `ALREADY_ACTIVE` only when the existing active-AFORE customer has the same NSS, while ignoring individual and combined differences in name, email, phone, and postal code.
- Persist a new intake record transactionally with preserved `original_payload` when CURP matches an active-AFORE customer but NSS differs.
- Finish that new intake in the dedicated final `IDENTITY_CONFLICT` status, persist exactly `{"reason": "curp_nss_conflict"}` in `processing_details`, commit that final state before surfacing the `409`, and replay the same `409` idempotently for the same external key.
- Keep the existing customer row, AFORE relation, and Rewards ID unchanged in both same-NSS and different-NSS reuse branches.
- Add focused unit and HTTP tests that prove initial conflict handling, committed persistence after `409`, exact metadata, replay behavior, payload preservation, and the no-update rule for contact-data-only differences.

**Non-Goals:**
- Change request validation, request schema, success schema, onboarding, eligibility, or real SISCA integration behavior.
- Introduce a customer-update or identity-repair flow for name, email, phone, postal code, CURP, or NSS.
- Change the current `500` inconsistency behavior for customers that lack an AFORE relation or whose relation is `INACTIVE` or `ENDED`.
- Add database migrations, indexes, or structural persistence redesign unless implementation later proves an actual enforced value restriction on `processing_status`.

## Decisions

1. Add a dedicated controlled application error and map it to a stable safe `409`.
The application layer should raise a specific error for the case "existing active-AFORE customer found by CURP, but incoming NSS differs from stored NSS". The API layer should map that error to `409` with a stable public code `curp_nss_conflict` and a generic safe message that does not echo identity fields or internal comparison details.

Alternative considered: reuse `ExternalRequestConflict`. Rejected because the failure is not about idempotency-key replay state; it is a distinct identity conflict that deserves its own stable code and dedicated tests.

2. Persist the new intake as a final `IDENTITY_CONFLICT` outcome and commit it before returning `409`.
The flow should keep auditability by storing the new intake, associating it to the existing customer identity resolved by CURP, preserving the incoming `original_payload`, setting `processed_at`, storing exactly `{"reason": "curp_nss_conflict"}` in `processing_details`, and closing the intake in final `IDENTITY_CONFLICT` inside the transaction that decides the outcome. The transaction must commit that terminal intake state before the application raises or translates the conflict to HTTP so the eventual `409` does not roll back the stored intake.

Alternative considered: roll back entirely and return `409` without storing the new intake. Rejected because it would lose the original request that triggered the identity conflict, reducing traceability.

3. Keep conflict metadata exact and opaque.
The persisted conflict record should store `processing_details` as exactly `{"reason": "curp_nss_conflict"}` and nothing else. It must not copy CURP, NSS, compared field values, or other personal data into that structure. The stored `original_payload` remains the source-of-truth audit artifact for the incoming request, while the HTTP response remains generic and safe.

Alternative considered: store the stored-vs-incoming NSS pair in `processing_details`. Rejected because it would unnecessarily multiply sensitive identity data and would increase leakage risk through logs or generic inspection tooling.

4. Treat same-NSS contact differences as no-op reuse.
When CURP resolves to an existing active-AFORE customer and NSS matches exactly after the existing trimming-only input contract, the flow should keep returning `ALREADY_ACTIVE`, preserve the new intake `original_payload`, and deliberately ignore individual or combined differences in name, email, phone, and postal code without mutating the customer record or Rewards ID.

Alternative considered: update mutable contact fields opportunistically on the `ALREADY_ACTIVE` path. Rejected because this change is explicitly not introducing a customer synchronization flow.

5. Reuse the current text-backed persistence model and avoid schema churn unless implementation discovers a real value restriction.
The current persistence model and Alembic migration define `processing_status` as `String(32)` / `VARCHAR(32)` with no PostgreSQL `ENUM`, `CHECK`, or discovered database whitelist, so adding `IDENTITY_CONFLICT` should remain an application-level status extension with no migration in the expected path. No new uniqueness rules, indexes, or input-output schema changes are needed for this proposal. If implementation later uncovers a real enforced value restriction outside the currently inspected model and migration, only the minimal migration needed to admit `IDENTITY_CONFLICT` should be introduced.

Alternative considered: encode the CURP/NSS mismatch as an existing status such as `INCOMPLETE` or `NOT_APPROVED`, or as a generic `CONFLICT`. Rejected because the business outcome is a terminal identity conflict, and collapsing it into a broader or generic status would weaken audit clarity and replay semantics.

6. Replay a committed `IDENTITY_CONFLICT` intake as the same safe `409`.
If `(source, external_request_id)` already points to an intake whose final state is `IDENTITY_CONFLICT`, the flow should not create or reprocess another intake. It should return the same safe `409 curp_nss_conflict` outcome and preserve the existing `original_payload`, `customer_id`, `processed_at`, and `processing_details` unchanged.

Alternative considered: treat `IDENTITY_CONFLICT` as a non-replayable generic conflict or recompute the branch from scratch. Rejected because the outcome is already terminal, committed, and should remain idempotent for the same key.

## Risks / Trade-offs

- [Risk] Adding `IDENTITY_CONFLICT` creates one more terminal intake status that must be recognized consistently across application, API, persistence, and replay tests. -> Mitigation: update the status spec, add focused unit coverage, and add HTTP assertions for both first-time conflict and replay.
- [Risk] Associating the conflicting intake to the existing customer could be misread as a successful match. -> Mitigation: require the terminal status to be `IDENTITY_CONFLICT`, keep the HTTP result as `409`, and avoid any customer, Rewards ID, or AFORE relation mutation.
- [Risk] A raised conflict exception could accidentally roll back the just-persisted intake. -> Mitigation: require the final intake state to be committed before raising or translating the controlled `409`, and verify persisted state after the HTTP conflict response.
- [Risk] Using a public code that names CURP/NSS could be seen as revealing internals. -> Mitigation: expose only the stable symbolic code `curp_nss_conflict` and a generic message, never the actual values or field-by-field comparison results.

## Migration Plan

This change is backward-compatible for request and success payloads but adds a new controlled `409` variant and a new internal terminal intake status. Implement by updating the application decision branch, adding the new controlled error mapping, extending the internal intake status enum to include `IDENTITY_CONFLICT`, and shipping the matching tests together. No SQL migration is expected from the currently inspected schema because `processing_status` is text-backed and has no discovered real value restriction; if implementation later discovers an enforced whitelist outside the inspected model and migration, add only the minimal migration needed to admit `IDENTITY_CONFLICT`.

## Open Questions

None. The proposal intentionally keeps contact-data synchronization, identity repair workflows, and any broader customer data reconciliation out of scope.
