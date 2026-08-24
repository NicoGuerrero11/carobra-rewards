## 1. Provider-neutral customer boundary

- [ ] 1.1 Define provider-neutral portal contracts and forbidden customer-facing evidence fields.
- [ ] 1.2 Remove SISCA, checkpoint, provider, source-reference, and integration-error terminology from every authenticated customer page.
- [ ] 1.3 Add automated contract and customer-route assertions that internal provider terminology is absent.

## 2. Portal projection and persistence

- [ ] 2.1 Add additive persistence for Rewards preferences, notification read state, learning progress, and document-request metadata.
- [ ] 2.2 Implement the authenticated customer portal projection from journey, product, activity, level, and ledger records.
- [ ] 2.3 Implement safe next-action selection without inventing points or unapproved level outcomes.
- [ ] 2.4 Implement bounded deterministic timeline and notification projections with provider-neutral templates.
- [ ] 2.5 Implement customer-safe product detail and contextual lifecycle guidance.
- [ ] 2.6 Implement authenticated preference updates and notification read-state commands.
- [ ] 2.7 Implement learning assignment/progress and document-request/upload-readiness contracts with disabled-safe defaults.
- [ ] 2.8 Add backend tests for ownership, idempotency, redaction, empty states, and feature gating.

## 3. Customer frontend experience

- [ ] 3.1 Add “Tu siguiente acción” and contextual help to Rewards.
- [ ] 3.2 Build customer activity, questionnaire, content, and document-request sections from real portal data.
- [ ] 3.3 Build the unified customer timeline and notification utility experience.
- [ ] 3.4 Build customer-safe product detail without provider evidence.
- [ ] 3.5 Expand Account with profile summary, Rewards preferences, security guidance, and support.
- [ ] 3.6 Expand Courses with assignments, recommendations, persisted progress, and truthful empty states.
- [ ] 3.7 Preserve the compact primary navigation and integrate Account and notifications as utility controls.

## 4. Verification and delivery

- [ ] 4.1 Add desktop and mobile E2E coverage for invited, active, attention, inactive, empty, and populated portal states.
- [ ] 4.2 Verify accessibility, no horizontal overflow, loading/error/empty states, and customer-language redaction.
- [ ] 4.3 Validate OpenSpec and all affected API, site-backend, and site-frontend test suites.
- [ ] 4.4 Create atomic commits for specification, backend projection, customer copy, and frontend portal experience.
