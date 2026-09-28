# Verification — 2026-09-28

## Automated checks

- API Ruff and Pyright: passed, no errors.
- API `pytest -m 'not integration' -q`: 151 passed; 39 integration tests deselected. Tests did not reset or write to production. Added PostgreSQL authentication round-trip coverage remains available for an isolated `TEST_DATABASE_URL`; it was not executed against production.
- Backend `npm test`: 276 passed, zero failures, seven database tests skipped because no test database is configured.
- Frontend `npm run check`: 88 files, zero errors/warnings/hints.
- Playwright onboarding suite with mock backend: 20 passed across desktop and mobile Chromium, including omission compatibility, exact leap-day payload, future/early date rejection without a POST, server field error, 320px layout and Mexico City day boundaries.
- Visually reviewed desktop and mobile screenshots of the field between names and email. Input and optional label fit without horizontal overflow.
- `openspec validate add-registration-birth-date --strict` and `git diff --check`: passed.

## Persistence and migration checks

The service test verifies that the date is assigned to the customer in the registration transaction and only auth user, customer, consent and SISCA validation models are inserted. No verified-birthday record or award is created.

The migration's compiled PostgreSQL upgrade is exactly `ALTER TABLE customers ADD COLUMN birth_date DATE;`. An isolated in-memory SQLite migration test verifies existing row preservation, nullability, date type and downgrade behavior; this is not a PostgreSQL integration test.

The user explicitly authorized adding only the optional column to the configured Neon production database. Before migration the revision was `20260910_numeric_rewards_ids`, the column was absent and there were six customers. Applied only `20260928_customer_birth_date` and verified:

- revision is `20260928_customer_birth_date`;
- column is nullable `DATE`, with no default;
- customer count remains six;
- zero birth dates populated; no backfill or test customer registrations.

## Local verification

Restarted the three local services from the current repository after migration, keeping the existing environment and Bonda courses read flag. No secret files or Bonda write flags were edited.

- `/registro`: HTTP 200 and `birth_date` input present.
- API OpenAPI: optional date-or-null birth-date schema.
- An intentionally invalid body containing only a future date was sent through frontend → backend → API. It returned HTTP 422 `invalid_birth_date` before registration could run; no valid identity or registration was submitted.

Self-reported dates are not verified evidence, do not award birthday points and do not alter eligibility. OpenSpec sync and archive remain outside the requested scope.

## Label refinement — 2026-09-28

Removed the visible “(opcional)” suffix at the user's request; the field now reads “Fecha de nacimiento”. Optional validation and persistence remain unchanged. Re-ran the mocked Playwright onboarding suite: 20 passed on desktop and mobile, including exact-label and omitted-date coverage. OpenSpec strict validation and `git diff --check` passed.
