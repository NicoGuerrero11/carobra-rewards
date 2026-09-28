## Context

The landing links to `/registro`; the browser sends registration through the site-backend to FastAPI. FastAPI owns customer persistence. Neither its registration contract nor the customer table currently has a birth date. Verified Rewards birthday evidence is a different table and must remain untouched.

## Goals / Non-Goals

**Goals:** Collect an optional date and persist it atomically with registration, with accessible errors and compatibility for existing clients.

**Non-Goals:** Birthday awards, age eligibility rules, deriving or verifying the date from CURP, profile editing, Bonda changes, production test registrations or automatic migrations.

## Decisions

- Add `birth_date` as an optional date-only `YYYY-MM-DD` value; omission or null remains supported. An empty browser field is omitted. This preserves existing registrations rather than imposing an unrequested requirement.
- Accept real calendar dates from 1900-01-01 through the current day in America/Mexico_City, inclusive. Validate browser input and server commands, rejecting timestamps, numeric coercions, impossible dates and future values. Do not invent a minimum age.
- Use a native date input after the customer's name, with `autocomplete="bday"`, the visible label “Fecha de nacimiento” without an optional suffix, bounds, field errors and first-invalid focus. The field remains optional. Keep the current visual design and mobile grid.
- Add a nullable `customers.birth_date` DATE column with no default or backfill. Include the value in the authenticated customer profile contract but do not pass it to Rewards identity evidence, SISCA or Bonda. No changes to `verified_birth_dates` or scheduled awards.
- Return the safe `invalid_birth_date` error through the API/site-backend, without reflecting submitted dates, passwords or raw validation payloads.

## Risks / Trade-offs

- [New model on old schema breaks reads] → Migrate before restarting the API; do not apply to production without explicit authorization.
- [Self-reported data mistaken for verified data] → Persist only in customer identity, with no wiring to verified-birthday workflows.
- [Midnight or timezone shifts] → Use date-only storage/transport and the same Mexico City calendar day for both validation layers.

## Migration Plan

Test the additive migration and persistence with an isolated test database when available. Confirm the current deployed revision, apply only the new migration after authorization, then run the updated API. Existing customer rows retain null. A code rollback can leave the nullable column in place; dropping it would lose newly collected dates and requires separate approval. Never execute database-reset test fixtures against the production URL.
