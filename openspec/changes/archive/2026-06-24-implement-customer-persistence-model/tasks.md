## 1. Update contracts, states, and normalization

- [x] 1.1 Replace provisional intake persistence contracts with `processing_status` and nullable `processing_details` instead of separate validation result and error fields.
- [x] 1.2 Add the closed internal state enums for intake, customer, onboarding, and customer-service relation as Python enum definitions used by persistence adapters.
- [x] 1.3 Implement `strip + uppercase` CURP normalization before persisting structured columns while keeping `original_payload` intact.
- [x] 1.4 Enforce repository and application contracts that treat CURP and NSS as non-editable in Rewards-managed flows.

## 2. Define separated repository ports

- [x] 2.1 Add `CustomerIntakeRequestRepository` methods to save intake, get by `source` plus `external_request_id`, associate customer, and update status and details.
- [x] 2.2 Add `CustomerRepository` methods to create a customer and fetch by UUID, Rewards ID, and CURP.
- [x] 2.3 Add `ServiceRepository` with lookup by service code.
- [x] 2.4 Add `CustomerServiceRepository` methods to create a relation, get by customer and service, and update status and dates.
- [x] 2.5 Update the unit-of-work port to expose all four repositories while hiding `AsyncSession`.

## 3. Implement ORM models

- [x] 3.1 Create the SQLAlchemy model for `customer_intake_requests` with application-generated UUID, normalized CURP column, `processing_status`, `processing_details JSONB`, `original_payload JSONB`, nullable `customer_id`, and lifecycle timestamps.
- [x] 3.2 Create the SQLAlchemy model for `customers` with application-generated UUID, `rewards_id VARCHAR(64) NOT NULL UNIQUE`, `curp VARCHAR(18) NOT NULL UNIQUE`, `nss VARCHAR(16) NOT NULL`, minimum identity fields, and current customer/onboarding statuses.
- [x] 3.3 Create the SQLAlchemy model for `services` with application-generated UUID, unique `code`, display name, active flag, and timestamps.
- [x] 3.4 Create the SQLAlchemy model for `customer_services` with application-generated UUID, restrictive foreign keys, relation status, optional `started_at`, optional `ended_at`, and timestamps.
- [x] 3.5 Add ORM relationships that keep intake optional to customer and customer-service separate from customer identity.

## 4. Configure metadata, constraints, foreign keys, and indexes

- [x] 4.1 Register the new models in the shared SQLAlchemy metadata used by Alembic.
- [x] 4.2 Add unique constraints for `customers.rewards_id`, `customers.curp`, `services.code`, `customer_services(customer_id, service_id)`, and `customer_intake_requests(source, external_request_id)`.
- [x] 4.3 Add restrictive foreign keys for intake-to-customer and customer-service references with `ON DELETE RESTRICT`.
- [x] 4.4 Add only the justified extra indexes for `customer_intake_requests.customer_id`, `customer_intake_requests.processing_status`, and `customer_services.service_id`.
- [x] 4.5 Centralize UTC timezone-aware defaults and `updated_at` refresh behavior for all new models.

## 5. Create migration and deterministic AFORE seed

- [x] 5.1 Create the Alembic migration that builds the four tables in dependency-safe order.
- [x] 5.2 Include all closed column sizes, nullability rules, JSONB columns, UUID columns, unique constraints, foreign keys, and indexes in the migration.
- [x] 5.3 Insert the `AFORE` service row deterministically in the migration without requiring application bootstrap.
- [x] 5.4 Implement downgrade steps that remove the seeded `AFORE` row and schema objects in reverse dependency order.

## 6. Implement SQLAlchemy repositories

- [x] 6.1 Implement the SQLAlchemy adapter for `CustomerIntakeRequestRepository`.
- [x] 6.2 Implement the SQLAlchemy adapter for `CustomerRepository`.
- [x] 6.3 Implement the SQLAlchemy adapter for `ServiceRepository`.
- [x] 6.4 Implement the SQLAlchemy adapter for `CustomerServiceRepository`.
- [x] 6.5 Ensure repositories receive Rewards ID explicitly instead of generating it silently.

## 7. Implement unit of work

- [x] 7.1 Implement a SQLAlchemy-backed unit of work that shares one async transactional session across intake, customer, service, and customer-service repositories.
- [x] 7.2 Implement commit and rollback behavior that can support the future atomic approval flow.
- [x] 7.3 Keep `AsyncSession` hidden from the application layer while repositories still participate in one transaction.

## 8. Add PostgreSQL persistence tests

- [x] 8.1 Add PostgreSQL integration tests for persisting intake without a customer.
- [x] 8.2 Add PostgreSQL integration tests for rejecting duplicate `(source, external_request_id)` keys.
- [x] 8.3 Add PostgreSQL integration tests proving no customer is created before approval.
- [x] 8.4 Add PostgreSQL integration tests for creating an approved customer with mandatory Rewards ID.
- [x] 8.5 Add PostgreSQL integration tests for rejecting duplicate CURP values.
- [x] 8.6 Add PostgreSQL integration tests for rejecting duplicate Rewards ID values.
- [x] 8.7 Add PostgreSQL integration tests preserving leading zeroes in NSS.
- [x] 8.8 Add PostgreSQL integration tests allowing repeated NSS values.
- [x] 8.9 Add PostgreSQL integration tests for CURP normalization with `strip + uppercase`.
- [x] 8.10 Add PostgreSQL integration tests proving `original_payload` remains intact after structured normalization.
- [x] 8.11 Add PostgreSQL integration tests for associating an intake with the approved customer.
- [x] 8.12 Add PostgreSQL integration tests for blocking intake reassignment in normal flows.
- [x] 8.13 Add PostgreSQL integration tests proving the `AFORE` service seed exists after migration.
- [x] 8.14 Add PostgreSQL integration tests for creating the customer-AFORE relation.
- [x] 8.15 Add PostgreSQL integration tests for rejecting duplicate customer-service relations.
- [x] 8.16 Add PostgreSQL integration tests for restrictive foreign key behavior.
- [x] 8.17 Add PostgreSQL integration tests proving service loss does not delete the customer.
- [x] 8.18 Add PostgreSQL integration tests proving `updated_at` changes on persistent updates.
- [x] 8.19 Add PostgreSQL integration tests for unit-of-work commit behavior.
- [x] 8.20 Add PostgreSQL integration tests for unit-of-work rollback behavior.
- [x] 8.21 Skip PostgreSQL integration tests explicitly when `TEST_DATABASE_URL` is not configured.
- [x] 8.22 Keep application and domain unit tests running without a database.

## 9. Verify upgrade and downgrade

- [x] 9.1 Execute Alembic upgrade against the PostgreSQL test database and verify UUID, JSONB, TIMESTAMPTZ, constraints, and seed data.
- [x] 9.2 Execute Alembic downgrade against the PostgreSQL test database and verify seeded data and tables are removed in the correct order.
- [x] 9.3 Confirm SQLite is not used to validate the PostgreSQL schema behavior for this change.

## 10. Execute Ruff

- [x] 10.1 Run Ruff on the updated persistence implementation and fix reported issues.

## 11. Execute Pyright

- [x] 11.1 Run Pyright on the updated persistence implementation and fix reported typing issues.

## 12. Execute pytest

- [x] 12.1 Run pytest for unit and PostgreSQL integration coverage and resolve failures.
- [x] 12.2 Verify architecture tests still prove application and domain independence from SQLAlchemy.

## 13. Update documentation

- [x] 13.1 Update technical documentation to describe the persistence model, the closed invariants, the AFORE seed strategy, and the PostgreSQL-only validation assumptions.
