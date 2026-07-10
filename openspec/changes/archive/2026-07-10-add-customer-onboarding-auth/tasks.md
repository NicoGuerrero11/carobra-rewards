## 1. Repository Layout

- [x] 1.1 Move the existing FastAPI backend, Alembic files, Python tests, scripts, and Python project configuration under `api/`
- [x] 1.2 Update Python import paths, test discovery, Alembic configuration, README commands, and local development commands for the new `api/` root
- [x] 1.3 Add root-level documentation or scripts that explain how to run API, site backend, and site frontend from the single repo
- [x] 1.4 Verify the moved API still passes its existing unit, routing, and migration tests before adding onboarding behavior

## 2. API Data Model and Migration

- [x] 2.1 Add persistence models for auth users with normalized unique email, password hash, password timestamps, optional email verification timestamp, and audit timestamps
- [x] 2.2 Add persistence models for customer consent records with customer reference, consent type, accepted timestamp, terms version, and audit metadata
- [x] 2.3 Update the customer model to replace `name` and required `nss` with `auth_user_id`, `first_name`, `last_name`, `phone`, `postal_code`, `state`, and `city`
- [x] 2.4 Add an Alembic migration that creates auth and consent tables, updates customer columns, and removes the required customer NSS contract
- [x] 2.5 Update persistence error classification for duplicate email, duplicate CURP, duplicate Rewards ID, duplicate consent constraints, and unexpected integrity failures

## 3. API Registration and Auth Domain

- [x] 3.1 Add domain and application commands for customer registration with CURP, first name, last name, email, phone, password, password confirmation, postal code, state, city, and terms acceptance
- [x] 3.2 Implement password validation, password confirmation validation, password hashing, and password verification without persisting raw passwords
- [x] 3.3 Implement the registration use case that atomically creates auth user, customer, terms consent, and initial pending SISCA validation
- [x] 3.4 Implement email/password login, session creation, session lookup, and logout behavior using HTTP-only browser-compatible cookies
- [x] 3.5 Add safe authenticated profile and validation-status reads for the owning customer without exposing password hashes, raw SISCA payloads, or technical exception details

## 4. API HTTP Contract

- [x] 4.1 Add FastAPI routes and schemas for `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and `GET /api/v1/me`
- [x] 4.2 Add or adapt `GET /api/v1/me/validation-status` for session-authenticated customer status reads
- [x] 4.3 Return stable error codes for duplicate email, duplicate CURP, password mismatch, missing terms acceptance, invalid credentials, and unauthenticated access
- [x] 4.4 Configure CORS and cookie settings for local site development without enabling wildcard credentialed origins
- [x] 4.5 Update OpenAPI-visible tags and schemas so legacy intake remains non-canonical and registration/login are the customer-facing entrypoints

## 5. Site Backend

- [x] 5.1 Create `site-backend/` as a TypeScript/Node BFF with environment configuration for API base URL and cookie settings
- [x] 5.2 Add site backend routes for registration, login, logout, current customer, and validation status
- [x] 5.3 Implement a typed API client that calls FastAPI, forwards authenticated cookies as needed, and maps API errors to stable site form errors
- [x] 5.4 Ensure the site backend does not write directly to Neon or duplicate customer/SISCA business logic
- [x] 5.5 Add site backend tests for successful proxy calls, duplicate field errors, invalid login, missing session, and API unavailability

## 6. Site Frontend Import and Adaptation

- [x] 6.1 Copy `NicoGuerrero11/demo-rewards` `frontend` into `site-frontend/` without importing the demo backend
- [x] 6.2 Remove or disable Google OAuth links, demo-only backend assumptions, and product copy that promises unimplemented rewards behavior
- [x] 6.3 Update `/registro` to collect CURP, first name, last name, email, phone, password, password confirmation, postal code, state, city, and terms acceptance
- [x] 6.4 Update `/login` to submit email and password through the site backend and handle stable error responses
- [x] 6.5 Update the landing and initial customer dashboard copy to describe Rewards registration plus pending AFORE validation instead of mock-only points and tiers
- [x] 6.6 Add frontend validation for required fields, password confirmation, terms acceptance, and accessible error display while preserving API-side validation as authoritative

## 7. End-to-End Verification

- [x] 7.1 Add API tests for successful registration transaction, rollback on validation creation failure, duplicate email, duplicate CURP, missing consent, mismatched passwords, and login/logout
- [x] 7.2 Add migration tests that cover auth tables, consent tables, updated customer columns, and removal of required NSS
- [x] 7.3 Add site integration tests for register, login, authenticated dashboard/status read, unauthenticated redirects, and API error rendering
- [x] 7.4 Run API formatting, linting, typing, unit tests, and PostgreSQL integration tests
- [x] 7.5 Run site backend and site frontend checks/builds plus browser smoke tests for desktop and mobile layouts
- [x] 7.6 Update README and environment examples for the single-repo `api`, `site-backend`, and `site-frontend` development workflow
