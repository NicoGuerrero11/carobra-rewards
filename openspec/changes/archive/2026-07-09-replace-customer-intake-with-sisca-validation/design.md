## Context

The repository currently exposes `POST /api/v1/customers/intake`, receives a
full SISCA-owned customer payload, decides eligibility synchronously, and creates
the customer only after approval. The agreed MVP reverses that ownership:
Rewards creates the customer from its own registration flow and then queries
SISCA using CURP to validate the AFORE operation.

The concrete SISCA URL, authentication method, and availability target are not
confirmed. The domain and persistence design therefore need a stable port that
can be exercised with a simulated adapter now and connected to the real service
later without changing lifecycle rules.

The earlier documentation change uses a five-business-day window. This design
supersedes that timing with exact elapsed checkpoints at 24, 72, and 120 hours
after `registered_at`.

## Goals / Non-Goals

**Goals:**

- Establish the minimum query/response contract between Rewards and SISCA.
- Create and persist a validation lifecycle triggered by completed Rewards
  registration.
- Execute the same validation operation from scheduled, retry, and manual paths.
- Preserve an auditable history without leaking CURP or raw payloads through
  logs and public responses.
- Make checkpoint processing idempotent and safe under concurrent workers.
- Retire the simulated full-profile intake as the target customer-creation API.
- Expose validation status needed by the future onboarding UI.

**Non-Goals:**

- Build registration, login, credential storage, sessions, or frontend screens.
- Select the frontend framework or deployment architecture.
- Finalize SISCA networking, authentication, or production credentials before
  SISCA confirms them.
- Define the operational notification channel for attention-required cases.
- Import or backfill historical full-profile intake payloads into validation
  checks automatically.

## Decisions

### 1. Registration creates the customer before SISCA validation

The registration application flow will persist the Rewards-owned customer and a
`PENDING` SISCA validation case in one transaction. The customer starts in
`PENDING_VALIDATION`; SISCA does not create or own the customer identity.

When validation succeeds, Rewards changes the case to `VALIDATED` and the
customer to `ACTIVE`. A terminal validation failure changes the case to
`CANCELLED` and the customer to `INACTIVE`. An inconclusive final result changes
only the case to `REQUIRES_ATTENTION` and keeps the customer non-active.

Alternative considered: delay customer creation until SISCA approves. Rejected
because login, profile ownership, and status visibility belong to Rewards and
must exist while validation is pending.

### 2. Use a SISCA client port with a minimal transport contract

Application code will depend on a `SiscaValidationGateway` port. Its operation
accepts normalized CURP and Rewards-generated tracing metadata and returns one
of these transport-level results:

- found validation data with `tipo_movimiento`, `estatus_sf`, and
  `fecha_traspaso`;
- successful query with no information (`found = false`);
- technical failure with a safe category and retryability signal.

The production adapter will send only CURP, `request_id`, and `requested_at`.
The latter two are non-personal tracing fields and may be placed in headers if
SISCA requires a body containing only CURP.

Alternative considered: expose the SISCA HTTP schema throughout the domain.
Rejected because endpoint shape and authentication remain unknown and raw
transport details must not define business states.

### 3. Model no information as a successful business response

The preferred SISCA response is HTTP `200` with either `found = true` and the
three validation fields or `found = false` with none of them. An adapter may map
a SISCA-specific `404` to `found = false` only if the final external contract
defines that meaning explicitly.

Timeouts, connection failures, `5xx`, authentication failures, rate limits, and
malformed bodies are technical failures. They never become `NO_INFORMATION`.

Alternative considered: use HTTP `404` as the canonical absence response.
Rejected because absence is an expected domain result, while `404` is commonly
ambiguous between missing data and a wrong route.

### 4. Separate case states, check outcomes, and raw SISCA values

`sisca_validations.status` uses Rewards-owned lifecycle states:

- `PENDING`
- `VALIDATED`
- `CANCELLED`
- `REQUIRES_ATTENTION`

Each `sisca_validation_checks.outcome` uses a normalized attempt result:

- `MATCH_VALIDATED`
- `MATCH_TEMPORARY_PENDING`
- `MATCH_CANCELLED`
- `MATCH_NOT_ELIGIBLE`
- `NO_INFORMATION`
- `TECHNICAL_FAILURE`

Raw SISCA values are stored only on the check and copied to last-result summary
columns on the case. They are never reused as internal status values.

### 5. Compute checkpoints as elapsed UTC instants

At registration time `t0`, Rewards stores these due instants:

- `H24`: `t0 + 24 hours`
- `D3`: `t0 + 72 hours`
- `D5`: `t0 + 120 hours`

These are elapsed hours, not calendar-day or business-day calculations. A
scheduler finds due pending cases and invokes the same application operation
used by the internal check endpoint. Scheduler cadence may delay actual
execution slightly, but decisions use the checkpoint identity and deadline,
not local calendar boundaries.

Alternative considered: business days. Rejected by the confirmed product rule.

### 6. Make each checkpoint idempotent and concurrency-safe

The check table has a unique logical execution key per validation and scheduled
checkpoint. Before calling SISCA, the application claims a due execution using
a database-enforced insert or row lock. Repeated scheduler delivery returns the
already-recorded result and does not create a second business decision.

Retries receive their own attempt number and reference the originating
checkpoint. Manual checks use `MANUAL` and are always recorded with a unique
request identifier. Terminal cases reject new scheduled checks but retain an
explicitly authorized manual diagnostic path that cannot silently reverse the
terminal state.

Alternative considered: rely on a single in-process scheduler. Rejected because
deployments and worker restarts can deliver work more than once.

### 7. Normalize SISCA data before applying checkpoint decisions

The application normalizes trimmed, case-insensitive catalog values at the
adapter boundary while preserving raw values for audit. The MVP mapping is:

- `ACEPTADA PROCESAR` plus allowed movement and transfer-date rules becomes
  `MATCH_VALIDATED`.
- `ACEPTADA OPERACIONES` becomes `MATCH_TEMPORARY_PENDING`.
- `CANCELADA` becomes `MATCH_CANCELLED`.
- `ACEPTADA PROCESAR` with a disallowed movement or date becomes
  `MATCH_NOT_ELIGIBLE`.
- `found = false` becomes `NO_INFORMATION`.
- transport or contract failure becomes `TECHNICAL_FAILURE`.
- unknown SISCA catalog values are malformed contract responses and therefore
  `TECHNICAL_FAILURE`, not business cancellation.

Allowed movement types and the minimum transfer date remain explicit
configuration, initially preserving the currently implemented MVP rules.

### 8. Apply checkpoint-specific decisions

At `H24` and `D3`:

- `MATCH_VALIDATED` validates the case and activates the customer.
- `MATCH_CANCELLED` or `MATCH_NOT_ELIGIBLE` cancels the case and makes the
  customer inactive.
- `MATCH_TEMPORARY_PENDING` or `NO_INFORMATION` keeps the case pending.
- `TECHNICAL_FAILURE` keeps the case pending and permits bounded technical
  retries without consuming a different scheduled checkpoint.

At `D5`:

- `MATCH_VALIDATED` validates and activates.
- `MATCH_CANCELLED`, `MATCH_NOT_ELIGIBLE`, or `NO_INFORMATION` cancels and
  records that team notification is required.
- `MATCH_TEMPORARY_PENDING` becomes `REQUIRES_ATTENTION`.
- `TECHNICAL_FAILURE` becomes `REQUIRES_ATTENTION`; it never auto-cancels a
  customer based on missing technical evidence.

Transitions and the corresponding check record are committed atomically.

### 9. Persist a case summary and immutable check history

`sisca_validations` stores the current lifecycle state, customer link,
registration/deadline timestamps, next due checkpoint, last normalized outcome,
last raw validation fields, terminal timestamps, and notification timestamp.

`sisca_validation_checks` stores checkpoint, attempt number, generated request
ID, check timestamps, safe request metadata, sanitized response metadata, HTTP
status when available, normalized outcome, raw validation fields, and safe error
category. CURP is referenced through the customer/case and is not duplicated in
generic JSON payload snapshots.

Full request or response bodies are not required for audit because their target
contract is small and typed columns preserve the relevant evidence. If raw
payload retention becomes legally required, it must be encrypted and governed
by a separate retention decision.

### 10. Expose internal execution and customer-facing status operations

The API will expose:

- `POST /api/v1/internal/sisca-validations/{validation_id}/checks` for an
  authenticated internal scheduler or operator to execute a due, retry, or
  manual check.
- `GET /api/v1/customers/{customer_id}/validation-status` for the authenticated
  owning customer or authorized internal actor to read a safe summary.

The status response contains Rewards-owned state, registration time, next
checkpoint time, and safe last outcome. It excludes CURP, raw SISCA payloads,
technical error details, and operational credentials.

The application service remains independent of FastAPI and SQLAlchemy so the
future registration flow can invoke validation creation directly rather than
making an internal HTTP call.

### 11. Retire the old intake route without destroying historical data

The old full-profile intake route and schemas stop being the canonical API and
are removed from OpenAPI and runtime routing when the replacement is enabled.
Existing intake rows may remain read-only for audit and rollback during a
transition release. No new customer or validation is created from that route.

Alternative considered: repurpose `/customers/intake` with a smaller payload.
Rejected because the caller direction, ownership, idempotency, and lifecycle are
different enough that reusing the route would preserve misleading semantics.

## Risks / Trade-offs

- [SISCA contract changes after implementation] -> Keep transport details behind
  the gateway and contract-test every adapter mapping.
- [Scheduler delivers the same checkpoint concurrently] -> Enforce unique
  execution keys and atomic state transitions in PostgreSQL.
- [SISCA is unavailable at the final checkpoint] -> Escalate to
  `REQUIRES_ATTENTION` instead of auto-cancelling on technical uncertainty.
- [Exact-hour checks run late because of scheduler cadence] -> Store due instants
  and monitor execution lag; decisions still retain the intended checkpoint.
- [CURP is sensitive and must remain queryable] -> Restrict access, exclude it
  from logs and status responses, and avoid duplicating it in check payload JSON.
- [Old intake code and new validation code coexist temporarily] -> Feature-gate
  route removal, keep migrations reversible, and prohibit dual writes.
- [Notification channel is not selected] -> Persist `team_notified_at` and an
  explicit notification-required state so notification delivery can be added
  without changing validation decisions.

## Migration Plan

1. Add validation and check tables, new status values, repository ports, and the
   SISCA gateway without changing the current route.
2. Implement validation creation and execution with a simulated gateway; verify
   migrations, domain tests, API contract tests, and concurrency behavior.
3. Update canonical SISCA documentation and the active earlier OpenSpec change
   so 24/72/120 elapsed hours are the only current timing rule.
4. Connect the future registration use case to atomically create customer and
   validation records.
5. Enable internal check/status endpoints and the scheduler behind configuration.
6. Disable and remove the full-profile intake route from OpenAPI after consumers
   confirm migration; retain historical intake rows read-only for the agreed
   audit period.
7. Roll back by disabling scheduler and replacement routes, restoring the legacy
   route flag, and downgrading only if no new validation records must be kept.

## Open Questions

- What URL, authentication scheme, and network allowlist will SISCA require?
- Will SISCA use the preferred `200 {"found": false}` absence shape or another
  response that the adapter must translate?
- What timeout, rate limit, and bounded retry values are acceptable to SISCA?
- Which channel and owner receive notifications for cancelled or
  attention-required cases?
- What retention period applies to validation check evidence and historical
  intake records?
