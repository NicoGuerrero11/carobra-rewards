## 1. Provider-neutral customer boundary

- [x] 1.1 Define provider-neutral portal contracts and forbidden customer-facing evidence fields.
- [x] 1.2 Remove SISCA, checkpoint, provider, source-reference, and integration-error terminology from every authenticated customer page.
- [x] 1.3 Add automated contract and customer-route assertions that internal provider terminology is absent.

## 2. Portal projection and persistence

- [x] 2.1 Add additive persistence for Rewards preferences, notification read state, learning progress, and document-request metadata.
- [x] 2.2 Implement the authenticated customer portal projection from journey, product, activity, level, and ledger records.
- [x] 2.3 Implement safe next-action selection without inventing points or unapproved level outcomes.
- [x] 2.4 Implement bounded deterministic timeline and notification projections with provider-neutral templates.
- [x] 2.5 Implement customer-safe product detail and contextual lifecycle guidance.
- [x] 2.6 Implement authenticated preference updates and notification read-state commands.
- [x] 2.7 Implement learning assignment/progress and document-request/upload-readiness contracts with disabled-safe defaults.
- [x] 2.8 Add backend tests for ownership, idempotency, redaction, empty states, and feature gating.

## 3. Customer frontend experience

- [x] 3.1 Add “Tu siguiente acción” and contextual help to Rewards.
- [x] 3.2 Build customer activity, questionnaire, content, and document-request sections from real portal data.
- [x] 3.3 Build the unified customer timeline and notification utility experience.
- [x] 3.4 Build customer-safe product detail without provider evidence.
- [x] 3.5 Expand Account with profile summary, Rewards preferences, security guidance, and support.
- [x] 3.6 Expand Courses with assignments, recommendations, persisted progress, and truthful empty states.
- [x] 3.7 Preserve the compact primary navigation and integrate Account and notifications as utility controls.

## 4. Verification and delivery

- [x] 4.1 Add desktop and mobile E2E coverage for invited, active, attention, inactive, empty, and populated portal states.
- [x] 4.2 Verify accessibility, no horizontal overflow, loading/error/empty states, and customer-language redaction.
- [x] 4.3 Validate OpenSpec and all affected API, site-backend, and site-frontend test suites.
- [x] 4.4 Create atomic commits for specification, backend projection, customer copy, and frontend portal experience.
