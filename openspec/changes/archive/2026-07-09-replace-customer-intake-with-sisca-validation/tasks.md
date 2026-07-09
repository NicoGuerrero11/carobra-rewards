## 1. Canonical Contract Alignment

- [x] 1.1 Replace the 5-business-day rule in canonical SISCA and customer-intake documentation with exact `H24`, `D3`, and `D5` checkpoints at 24, 72, and 120 elapsed hours
- [x] 1.2 Reconcile or supersede the active `align-customer-intake-with-final-sisca-contract` change so it no longer defines conflicting timing or intake ownership
- [x] 1.3 Document the canonical SISCA query, found response, no-information response, safe technical categories, and unresolved production URL/authentication settings

## 2. Domain and Application Model

- [x] 2.1 Add validation case states, checkpoint types, normalized check outcomes, safe technical categories, and legal transition rules to the domain layer
- [x] 2.2 Define typed SISCA gateway request/result contracts that expose found data, no information, and technical failure without FastAPI, SQLAlchemy, or HTTP dependencies
- [x] 2.3 Implement normalization for SISCA catalogs, allowed movement types, transfer-date eligibility, and unknown-value contract failures
- [x] 2.4 Implement an application operation that creates a pending validation and its 24/72/120-hour schedule atomically with a Rewards-owned registered customer
- [x] 2.5 Implement the shared validation-check use case for scheduled, retry, and manual executions, including all early and final checkpoint decisions
- [x] 2.6 Add terminal-state protection, bounded technical retry handling, and safe replay behavior for already-executed checkpoints

## 3. Persistence and Migration

- [x] 3.1 Add an Alembic migration for `sisca_validations`, `sisca_validation_checks`, customer `PENDING_VALIDATION`, required foreign keys, uniqueness constraints, and due-work indexes
- [x] 3.2 Add SQLAlchemy models and mappings for validation case summaries and immutable check attempts without generic CURP or credential payload storage
- [x] 3.3 Add repository ports and PostgreSQL adapters for case creation, due-case lookup, checkpoint claiming, attempt history, state transitions, and status reads
- [x] 3.4 Extend the unit of work so registration plus validation creation and check plus customer/service transition commit or roll back atomically
- [x] 3.5 Prove database-backed checkpoint idempotency and concurrent-worker behavior with PostgreSQL integration tests

## 4. SISCA Adapter and Operational Safety

- [x] 4.1 Add runtime configuration for SISCA base URL, timeout, retry limits, enabled adapter, movement rules, and minimum transfer date without committing credentials
- [x] 4.2 Implement a deterministic simulated SISCA adapter for local development and lifecycle tests using the canonical minimal contract
- [x] 4.3 Implement the configurable HTTP SISCA adapter with CURP-only business data, UUID/request-time tracing, response validation, and safe failure classification
- [x] 4.4 Add bounded retry policy and structured telemetry that excludes CURP, credentials, raw payloads, and raw exceptions
- [x] 4.5 Add adapter contract tests for found, no-information, timeout, rate-limit, server-error, authentication-error, malformed-body, and unknown-catalog responses

## 5. Validation API and Scheduling

- [x] 5.1 Expose an authenticated internal check operation at `POST /api/v1/internal/sisca-validations/{validation_id}/checks` with safe reusable error schemas
- [x] 5.2 Expose an authorized status read at `GET /api/v1/customers/{customer_id}/validation-status` without CURP, raw SISCA data, or technical exception details
- [x] 5.3 Implement a scheduler-compatible due-validation runner that invokes the shared application use case and measures checkpoint execution lag
- [x] 5.4 Add API and application tests for authorization, safe responses, exact checkpoint decisions, stale work, retries, manual diagnostics, and atomic rollback

## 6. Legacy Intake Retirement

- [x] 6.1 Remove `POST /api/v1/customers/intake` and its full-profile SISCA request/response schemas from runtime routing and OpenAPI behind a migration-safe release switch
- [x] 6.2 Stop new writes to legacy intake persistence while retaining existing intake rows read-only for the agreed audit and rollback period
- [x] 6.3 Remove or replace tests, demos, and playbooks that treat structural intake validity as SISCA approval or customer creation

## 7. End-to-End Verification

- [x] 7.1 Add a migration test covering upgrade, preservation of historical intake rows, new validation writes, and safe downgrade constraints
- [x] 7.2 Add an end-to-end test from registered customer plus pending validation through `H24`, `D3`, and `D5` outcomes using the simulated adapter
- [x] 7.3 Verify formatting, linting, unit tests, PostgreSQL integration tests, OpenAPI schema, and sensitive-data log assertions
- [x] 7.4 Record the remaining SISCA production dependencies and the application hook the later registration/login change must invoke
