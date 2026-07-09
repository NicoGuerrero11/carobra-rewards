## Why

The current API models SISCA as the source of a complete customer intake, but the
agreed MVP makes Rewards the owner of customer registration and uses SISCA only
to validate the customer's AFORE operation. The backend contract must be
replaced before onboarding is built so registration can start the correct
validation lifecycle and expose reliable status to the future site.

## What Changes

- **BREAKING** Replace the SISCA-to-Rewards full customer intake contract with a
  Rewards-to-SISCA validation query that sends only normalized CURP plus
  non-personal request tracing metadata.
- Define explicit SISCA responses for a found validation and for a successful
  query with no information, while keeping business absence separate from
  transport, timeout, and malformed-response failures.
- Create a pending SISCA validation when Rewards completes customer registration
  and evaluate it at 24, 72, and 120 elapsed hours from registration.
- Persist one validation case per customer and an immutable history of every
  scheduled, manual, retry, or duplicate-safe check.
- Normalize SISCA data into internal check outcomes and keep raw SISCA values
  separate from Rewards-owned lifecycle states.
- Activate, cancel, or mark a case as requiring attention according to the
  checkpoint and normalized outcome, with technical failures never interpreted
  as "no information".
- Add internal API operations to execute a validation check and read a
  customer's validation status; automatic execution remains the responsibility
  of a scheduler or worker using the same application operation.
- **BREAKING** Retire the historical `POST /api/v1/customers/intake` flow as the
  canonical integration entrypoint and remove its full-profile SISCA payload
  from the target API contract.
- Update the SISCA integration and business-rule documentation to replace the
  previous 5-business-day window with exact checkpoints at 24, 72, and 120
  elapsed hours.
- Keep customer registration, authentication, onboarding screens, and frontend
  architecture outside this API-first change.

## Capabilities

### New Capabilities
- `sisca-validation-query-contract`: Defines the minimum outbound CURP query,
  SISCA response shapes, tracing, timeout/error classification, and safe handling
  of validation data.
- `sisca-validation-lifecycle`: Defines creation of the validation case,
  checkpoints at 24/72/120 hours, normalized outcomes, state transitions,
  retries, team-attention outcomes, and status visibility.

### Modified Capabilities
- `customer-persistence-model`: Changes customer creation from SISCA-approved
  intake to Rewards registration and adds durable validation case and check
  history records with their integrity and privacy rules.
- `simulated-customer-intake-flow`: Supersedes the full-profile simulated intake
  endpoint and removes it as the target entrypoint for customer creation.

## Impact

- Affects the FastAPI v1 customer-intake routes and schemas, application service
  boundaries, domain states, repository ports, SQLAlchemy models, and Alembic
  migrations.
- Introduces an outbound SISCA client abstraction and scheduler-compatible check
  operation; the concrete production SISCA transport can remain configurable or
  simulated until SISCA confirms its endpoint and authentication details.
- Requires replacing or migrating tests that currently assert SISCA-owned full
  customer intake behavior.
- Requires reconciliation with the active
  `align-customer-intake-with-final-sisca-contract` documentation change because
  its 5-business-day rule is superseded by this proposal.
- Provides the backend contract that the later registration and login proposal
  will call after a customer completes registration.
