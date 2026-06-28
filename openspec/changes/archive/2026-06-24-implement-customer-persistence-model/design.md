## Context

The functional source of truth for this change is [docs/Flujo inicial de alta de clientes desde SISCA.pdf](/Users/nicolasguerrero/work/carobra-rewards/docs/Flujo%20inicial%20de%20alta%20de%20clientes%20desde%20SISCA.pdf). That PDF confirms the core lifecycle for the MVP:

- Receiving an intake request does not mean approval.
- Rewards validates, checks CURP reuse, determines eligibility, and only then approves or stops the intake.
- The customer and Rewards ID are created only when the intake is approved.
- Rewards ID exists before onboarding completes.
- Rewards communicates Rewards ID to SISCA only after onboarding completes.
- CURP and NSS are controlled by SISCA and must not be editable from Rewards-managed flows.
- AFORE is the first service in scope, but not part of the fixed customer identity.

The existing repository already has a modular `customer_intake` boundary where HTTP lives under `api/` and the module internals live under `modules/customer_intake/`. This change adds only planning artifacts; it does not implement code, endpoints, ORM models, or migrations yet.

## Goals / Non-Goals

**Goals:**
- Define an implementable persistence model for intake requests, customers, services, and customer-service relations.
- Close the technical decisions required to implement the first persistence slice without deferring them to coding time.
- Keep the persistence model aligned with the PDF lifecycle and invariants.
- Preserve the existing architectural rule that SQLAlchemy stays in infrastructure and application/domain remain framework-agnostic.
- Prepare ports and a unit of work capable of a future atomic approval flow.

**Non-Goals:**
- Implement the productive intake endpoint.
- Implement full eligibility rules, invitation sending, onboarding, or SISCA synchronization.
- Define SISCA’s final transport contract, official field names, official catalogs, or authentication mechanism.
- Implement a full Afore operational data model.
- Reorganize the module structure created in the previous task.

## Decisions

### 1. Persist intake requests independently from customers

`customer_intake_requests` is a first-class entity distinct from `customers`.

Why:
- The PDF states that requests can be received, processed, left incomplete, found not approved, found not eligible, kept pending, or recognized as already active without creating a customer.
- Intake history must remain available for traceability and idempotency preparation.

Implementation consequence:
- `customer_intake_requests.customer_id` is nullable.
- Customer creation happens only from an approved intake.

### 2. Create customer and Rewards ID in the same transaction only when approved

`customers.rewards_id` will be `NOT NULL UNIQUE`, and a customer row must never exist without a Rewards ID.

Why:
- The PDF explicitly states that Rewards creates the internal ID when the intake is validated and approved.
- The user requirement closes the implementation rule: customer and Rewards ID are created together in one transaction.

Implementation consequence:
- The repository layer cannot silently generate Rewards ID.
- A future approval application service must receive a pre-generated Rewards ID from a dedicated generator dependency or application logic before persisting the customer.

### 3. Use application-generated UUIDs as technical identifiers

All main entities use PostgreSQL `UUID`, Python `uuid.UUID`, and application-side UUID generation.

Why:
- IDs are available before flush.
- Internal relations can be assembled before insert ordering becomes visible.
- Tests can use deterministic or directly instantiated IDs.
- In-memory adapters and SQLAlchemy adapters can follow the same identity shape.

Implementation consequence:
- The UUID is not a business identifier.
- The UUID must never be communicated as Rewards ID.

### 4. Keep Rewards ID opaque and separate from technical identity

Rewards ID is a business identifier stored as `VARCHAR(64) NOT NULL UNIQUE`.

Why:
- The PDF states it belongs exclusively to Rewards, identifies the customer rather than the service, exists before onboarding completes, is not derived from PII, and is not reusable.
- `VARCHAR(64)` is flexible enough for a future opaque format without forcing unbounded text.

Implementation consequence:
- The generation algorithm remains out of scope.
- The column contract is closed: text, nullable false, unique true, immutable by repository/application contracts.

### 5. Normalize CURP before persistence but preserve the original payload

Structured CURP columns will use `strip + uppercase` normalization before persistence.

Why:
- The user closed the normalization rule.
- The PDF confirms CURP is used to identify the person, must not map to two Rewards customers, and must not be edited from Rewards.

Implementation consequence:
- `customers.curp` will be `VARCHAR(18) NOT NULL UNIQUE`.
- `customer_intake_requests.curp` will store the normalized value used by internal processing.
- `original_payload` remains unchanged and may still contain the original incoming CURP representation.
- Immutability is enforced through application contracts, repository methods, and tests, not merely by uniqueness.

### 6. Store NSS as text, required, repeated if necessary, and immutable

`customers.nss` will be `VARCHAR(16) NOT NULL` with no uniqueness constraint.

Why:
- The PDF marks NSS as controlled by SISCA, non-editable from Rewards, and part of the identity-related data received from SISCA.
- The user closed the decision that NSS is not unique in this version.
- `VARCHAR(16)` is sufficient for current Mexican NSS representations while preserving leading zeroes.

Implementation consequence:
- Repeated NSS values are allowed.
- NSS updates are blocked in Rewards-managed flows.

### 7. Store processing outcome as status plus structured details

`customer_intake_requests` will use:
- `processing_status VARCHAR(32) NOT NULL`
- `processing_details JSONB NULL`

Why:
- This removes the prior ambiguity between `validation_result` and `validation_errors`.
- The PDF distinguishes functional outcomes such as incomplete validation, not approved, not eligible, eligibility pending, approved, already active, and prior unfinished record.

Implementation consequence:
- The main status stays queryable and enum-controlled.
- Structured findings remain available without proliferating narrow columns too early.

### 8. Preserve the original payload as JSONB and treat it as sensitive

`original_payload JSONB NOT NULL`

Why:
- The PDF requires preserving SISCA-controlled values and original traceability.
- JSON payload at the transport boundary does not imply document persistence as the whole model.

Implementation consequence:
- The payload is never the substitute for normalized columns.
- Generic API responses and logs must not expose the payload wholesale by default.

### 9. Use internal Rewards statuses as Python-enum-controlled text columns

This first version will use text columns controlled by Python enums, not PostgreSQL enums.

Closed state sets for this change:

- `customer_intake_requests.processing_status`
  - `RECEIVED`
  - `PROCESSING`
  - `INCOMPLETE`
  - `NOT_APPROVED`
  - `NOT_ELIGIBLE`
  - `ELIGIBILITY_PENDING`
  - `APPROVED`
  - `ALREADY_ACTIVE`

- `customers.customer_status`
  - `PENDING_ONBOARDING`
  - `ACTIVE`
  - `INACTIVE`
  - `BLOCKED`

- `customers.onboarding_status`
  - `PENDING`
  - `COMPLETED`
  - `EXPIRED`

- `customer_services.status`
  - `ACTIVE`
  - `INACTIVE`
  - `ENDED`

Why:
- The PDF confirms the separation between SISCA operational states and internal Rewards states.
- Text columns are easier to evolve safely in early migrations than PostgreSQL enums.

Implementation consequence:
- On customer creation from approved intake: `customer_status = PENDING_ONBOARDING`, `onboarding_status = PENDING`.

### 10. Keep customer identity separate from AFORE and service-specific data

Core entities remain:
- `customers`
- `services`
- `customer_services`

Why:
- The PDF explicitly states AFORE is not a fixed attribute of the customer and that a customer may have several services over time.
- A service loss must not delete the customer, the ID, or the historical record.

Implementation consequence:
- Afore operational fields such as movement type, SF status, NAP, mobility, balances, voluntary contributions, and transfer out stay out of `customers`.
- Those fields can be introduced later through a service-specific extension once official SISCA technical documentation exists.

### 11. Seed the AFORE service deterministically in the Alembic migration

The initial `AFORE` service row will be inserted by the migration itself and removed by downgrade.

Why:
- The user closed this decision.
- The application must query services by `code`, not depend on a known UUID.

Implementation consequence:
- The migration creates the schema and inserts `AFORE` in a deterministic, reversible way.
- Application code will fetch `AFORE` by `services.code`.

### 12. Use restrictive foreign keys and no destructive cascades

Foreign keys:
- `customer_intake_requests.customer_id -> customers.id ON DELETE RESTRICT`
- `customer_services.customer_id -> customers.id ON DELETE RESTRICT`
- `customer_services.service_id -> services.id ON DELETE RESTRICT`

Why:
- Intake history, customer identity, and service relationship history must be preserved.
- Service loss is represented by state and dates, not deletion.

Implementation consequence:
- No cascade deletes.
- No orphan delete for historical records.

### 13. Avoid redundant indexes and add only justified extras

Unique constraints already cover these lookups:
- `customers.rewards_id`
- `customers.curp`
- `services.code`
- `customer_services(customer_id, service_id)`
- `customer_intake_requests(source, external_request_id)`

Additional indexes justified for this version:
- `customer_intake_requests.customer_id`
  - supports later joins from intake to approved customer
- `customer_intake_requests.processing_status`
  - supports operational filtering by functional outcome
- `customer_services.service_id`
  - supports queries from service to linked customers and service-level operations

No extra indexes should be added on the already unique columns above.

### 14. Prepare a single unit of work for future atomic approval flow

The future approval flow must be able to atomically:
1. create customer
2. persist Rewards ID
3. create AFORE relation
4. associate intake with customer
5. update intake status
6. commit

Why:
- The user explicitly requires rollback safety across all those steps.

Implementation consequence:
- `UnitOfWork` exposes all repositories over one transaction and hides `AsyncSession` from application services.

### 15. Keep persistence under `customer_intake` for now, while documenting broader semantics

The initial implementation may remain under `modules/customer_intake/infrastructure/persistence/`.

Why:
- This is the pragmatic place that matches the current repo structure.
- The concepts `Customer`, `Service`, and `CustomerService` are central to Rewards, not SISCA-only, but extracting them now would be premature architecture churn.

Implementation consequence:
- A later architectural extraction may happen when a second functional consumer appears.

## Proposed Schema

### `customer_intake_requests`

- `id`: PostgreSQL `UUID`, PK, application-generated
- `source`: `VARCHAR(50)`, not null
  - enough for stable upstream source codes like `SISCA` and future external systems without leaving it unbounded
- `external_request_id`: `VARCHAR(120)`, not null
  - flexible enough for upstream event or request identifiers without defaulting to unlimited text
- `curp`: `VARCHAR(18)`, not null
  - stores normalized `strip + uppercase` value
- `processing_status`: `VARCHAR(32)`, not null
- `processing_details`: `JSONB`, nullable
- `original_payload`: `JSONB`, not null
- `customer_id`: PostgreSQL `UUID`, nullable, FK to `customers.id`, `ON DELETE RESTRICT`
- `received_at`: `TIMESTAMP WITH TIME ZONE`, not null
- `processed_at`: `TIMESTAMP WITH TIME ZONE`, nullable
- `created_at`: `TIMESTAMP WITH TIME ZONE`, not null
- `updated_at`: `TIMESTAMP WITH TIME ZONE`, not null

Constraints:
- unique `(source, external_request_id)`

Additional indexes:
- index on `customer_id`
- index on `processing_status`

### `customers`

- `id`: PostgreSQL `UUID`, PK, application-generated
- `rewards_id`: `VARCHAR(64)`, not null, unique
- `curp`: `VARCHAR(18)`, not null, unique
- `nss`: `VARCHAR(16)`, not null
- `name`: `VARCHAR(200)`, not null
  - long enough for full names without using unbounded text
- `email`: `VARCHAR(254)`, not null
  - standard practical maximum
- `phone`: `VARCHAR(32)`, nullable
- `postal_code`: `VARCHAR(16)`, nullable
- `customer_status`: `VARCHAR(32)`, not null
- `onboarding_status`: `VARCHAR(32)`, not null
- `created_at`: `TIMESTAMP WITH TIME ZONE`, not null
- `updated_at`: `TIMESTAMP WITH TIME ZONE`, not null

Constraints:
- unique `rewards_id`
- unique `curp`

No additional indexes on `rewards_id` or `curp` beyond the unique constraints.

### `services`

- `id`: PostgreSQL `UUID`, PK, application-generated
- `code`: `VARCHAR(32)`, not null, unique
- `name`: `VARCHAR(100)`, not null
- `is_active`: `BOOLEAN`, not null
- `created_at`: `TIMESTAMP WITH TIME ZONE`, not null
- `updated_at`: `TIMESTAMP WITH TIME ZONE`, not null

Constraints:
- unique `code`

### `customer_services`

- `id`: PostgreSQL `UUID`, PK, application-generated
- `customer_id`: PostgreSQL `UUID`, not null, FK to `customers.id`, `ON DELETE RESTRICT`
- `service_id`: PostgreSQL `UUID`, not null, FK to `services.id`, `ON DELETE RESTRICT`
- `status`: `VARCHAR(32)`, not null
- `started_at`: `TIMESTAMP WITH TIME ZONE`, nullable
- `ended_at`: `TIMESTAMP WITH TIME ZONE`, nullable
- `created_at`: `TIMESTAMP WITH TIME ZONE`, not null
- `updated_at`: `TIMESTAMP WITH TIME ZONE`, not null

Constraints:
- unique `(customer_id, service_id)`

Additional indexes:
- index on `service_id`

## ORM and Repository Placement

Planned locations:
- ORM models: `src/carobra_rewards/modules/customer_intake/infrastructure/persistence/models.py` or equivalent split files under that package
- SQLAlchemy repositories: `src/carobra_rewards/modules/customer_intake/infrastructure/persistence/repositories.py` or split adapters
- Port definitions:
  - `CustomerIntakeRequestRepository`
  - `CustomerRepository`
  - `ServiceRepository`
  - `CustomerServiceRepository`
  - `UnitOfWork`
- Alembic metadata registration: through the existing shared SQLAlchemy metadata path already used by the project

Repository contracts closed for this change:

- `CustomerIntakeRequestRepository`
  - save intake
  - get by `source` and `external_request_id`
  - associate customer
  - update status and details

- `CustomerRepository`
  - create customer
  - get by UUID
  - get by Rewards ID
  - get by CURP

- `ServiceRepository`
  - get by service code

- `CustomerServiceRepository`
  - create relation
  - get by customer and service
  - update status and dates

- `UnitOfWork`
  - share one transactional session
  - expose all repositories
  - commit
  - rollback
  - never leak `AsyncSession` to application services

## Timestamp Strategy

All persisted timestamps use timezone-aware UTC values:
- `created_at` set consistently on insert
- `updated_at` refreshed on every persistent update
- `received_at` records when Rewards received the intake request
- `processed_at` stays null until processing reaches a concluded state

The implementation should centralize timestamp creation and update behavior in persistence defaults or utilities so naive datetimes do not leak into the system.

## Migration Plan

1. Add the ORM models and shared metadata registration.
2. Create an Alembic revision that creates `customers`, `services`, `customer_intake_requests`, and `customer_services` in dependency-safe order.
3. Insert the `AFORE` service row deterministically in the same migration.
4. Add downgrade steps that remove dependent rows and tables in reverse order, including the seeded `AFORE` record.
5. Add SQLAlchemy repository adapters and a unit-of-work implementation on top of the project’s async session factory.
6. Add PostgreSQL integration tests for schema behavior, repositories, and transaction semantics.

Rollback strategy:
- downgrade removes seeded service data first where required by FK ordering
- downgrade removes tables in reverse dependency order
- rollback of application operations is handled by the unit of work transaction, not by ad hoc repository behavior

## Risks / Trade-offs

- [Official SISCA field names and catalogs remain unavailable] -> Keep persistence focused on closed MVP invariants and avoid inventing official transport fields or catalog values.
- [Rewards ID algorithm is not finalized] -> Close the storage contract now and defer only the generator implementation and final visual format.
- [Processing details may grow over time] -> Use JSONB for flexible structured details while keeping the primary processing status explicit and queryable.
- [Persistence stays under `customer_intake` although some concepts are broader] -> Accept the pragmatic location now and revisit extraction in a later architecture change if another functional consumer appears.
- [PostgreSQL-specific behavior matters for JSONB, UUID, TIMESTAMPTZ, and constraints] -> Run persistence integration tests against PostgreSQL compatible with Neon and do not validate this schema with SQLite.

## Open Questions

- What will be the final generation algorithm and final visual format for Rewards ID, as long as it remains opaque, unique, immutable, non-personal, and stored as `VARCHAR(64) NOT NULL UNIQUE`?
