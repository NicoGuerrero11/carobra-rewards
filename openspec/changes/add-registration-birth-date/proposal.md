## Why

Customers entering through the landing page cannot provide their birth date during registration. The date must be collected and saved reliably rather than appearing only as an unsaved form field.

## What Changes

- Add an optional, accessible date-of-birth input to the existing registration form.
- Validate calendar dates and reject future dates in the browser and API; preserve requests that omit the field.
- Persist the self-reported date as a nullable customer field through an additive migration.
- Keep this data separate from verified birthday evidence, points, SISCA validation and level decisions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `customer-onboarding-auth`: Accept and validate an optional self-reported date of birth.
- `customer-persistence-model`: Store the optional date without backfilling existing customers or treating it as verified evidence.

## Impact

Registration UI, API registration command/service/model, site-backend error mapping, tests and one nullable PostgreSQL column. No new dependencies or changes to Bonda. Production migration requires explicit authorization and must precede running the new API model.
