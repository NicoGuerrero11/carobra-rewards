## Context

The repository currently contains a FastAPI backend at the repo root with
OpenSpec artifacts, Alembic migrations, SQLAlchemy models, and tests. The
implemented API already supports customer persistence and SISCA validation
foundations, but customer-facing registration and login are still pending.

The separate private repository `NicoGuerrero11/demo-rewards` contains an
Astro/Tailwind frontend with a landing page, registration page, login page,
client dashboard, and admin dashboard mockups. Its backend and auth behavior are
demo-oriented and must not become the business source of truth.

The agreed target is one repository with three top-level technical areas:

```text
carobra-rewards/
├─ api/
├─ site-backend/
├─ site-frontend/
└─ openspec/
```

The customer registration data for this MVP is CURP, first name, last name,
email, phone, password, password confirmation, postal code, state, city, and
mandatory terms and conditions acceptance. NSS is not requested from the
customer.

## Goals / Non-Goals

**Goals:**

- Keep one repository while separating API, site backend, and site frontend by
  folder and responsibility.
- Move the current FastAPI application into `api/` without changing its domain
  ownership.
- Import `demo-rewards/frontend` into `site-frontend/` as the starting visual
  and interaction base.
- Build `site-backend/` as a thin BFF for the web experience.
- Add real customer registration and login backed by FastAPI, Neon, and secure
  password/session handling.
- Atomically create auth user, customer, terms consent, and pending SISCA
  validation when registration completes.
- Remove NSS from customer registration and persistence requirements.

**Non-Goals:**

- Do not split into multiple GitHub repositories.
- Do not copy the `demo-rewards` backend as a production foundation.
- Do not implement Google OAuth in this change.
- Do not implement points, rewards, redemption rules, campaigns, or full admin
  operations.
- Do not make `site-backend` the owner of customer, SISCA, rewards, or auth
  business rules.
- Do not expose raw SISCA evidence or credentials to the site frontend.

## Decisions

### Decision: Single repo with explicit top-level application folders

Use one repository with `api/`, `site-backend/`, and `site-frontend/`.

Rationale: the project is still early, but the API and site have different
runtime concerns. Folder separation gives deployment and ownership clarity while
keeping specs, code review, and cross-application changes in one repo.

Alternatives considered:

- Keep everything at repo root: simpler initially, but it will blur API and site
  ownership once the frontend and BFF are imported.
- Split into two or three repos: operationally clean later, but unnecessary
  coordination overhead now.

### Decision: FastAPI remains the business API

FastAPI owns authentication, password hashing, sessions, customer creation,
consent records, Rewards ID creation, SISCA validation creation, and Neon
transactions.

Rationale: existing persistence, validation lifecycle, tests, and OpenSpec
contracts already live in the Python backend. Keeping business rules there
prevents a second implementation in the site layer.

Alternatives considered:

- Move auth into the site backend: convenient for forms but would split customer
  identity and session truth away from the API.
- Use the demo backend: fast visually, but it is not aligned with the real
  SISCA/customer contract.

### Decision: Site backend is a thin TypeScript BFF

Create `site-backend/` as a small TypeScript/Node service that exposes
web-facing routes, calls FastAPI, forwards or sets web cookies according to the
API session contract, and maps API errors into stable form errors.

Rationale: Astro frontend code and the imported demo already use Node tooling.
A thin TypeScript BFF keeps browser-facing concerns close to the site while
leaving all business decisions in the API.

Alternatives considered:

- Let Astro call FastAPI directly from the browser: fewer moving parts, but CORS,
  cookie domain, and form error ergonomics become more fragile.
- Use another FastAPI service for the site backend: consistent language, but
  less natural for the Astro/Tailwind frontend toolchain and duplicates Python
  app infrastructure.

Astro owns a same-origin server route for `/api/v1/*` in both development and
production. That route forwards only the allowed customer-auth endpoints to the
site backend, so browser code never needs the FastAPI base URL or a direct
cross-origin API call.

### Decision: Import only the demo frontend

Copy `demo-rewards/frontend` into `site-frontend/` and adapt it. Remove or hide
demo-only OAuth affordances and replace mock copy/forms with real MVP fields.

Rationale: the existing landing and auth pages provide useful visual structure.
The backend demo has no production value for the agreed business contract.

Alternatives considered:

- Rebuild the site from scratch: cleaner technically, but wastes the existing
  visual direction.
- Keep the demo repo as the web repo: conflicts with the single-repository
  decision.

### Decision: Registration is one API transaction

The API registration use case creates `auth_user`, `customer`,
`customer_consent`, and initial `sisca_validation` in one database transaction.
On failure, none of these records remain partially created.

Rationale: login identity, customer identity, legal consent, and validation
state are all required for a completed Rewards registration.

Alternatives considered:

- Multi-step draft onboarding: useful later, but the current MVP defines a
  completed registration as the start of SISCA validation.
- Create customer before auth user: creates orphan risk and complicates login.

### Decision: Email/password for MVP

Use email and password for register/login. Password confirmation is accepted by
the UI and API for validation but never persisted.

Rationale: the user explicitly selected password-based registration. OAuth can
be added later without blocking the base customer flow.

Alternatives considered:

- Passwordless email codes: lower account-recovery complexity, but no longer
  matches the selected MVP.
- Google OAuth: present in the demo, but not part of this change.

## Risks / Trade-offs

- Repo reorganization may break imports, Alembic paths, and test discovery ->
  migrate in a narrow first step and keep compatibility commands documented.
- Separate `site-backend` adds one service to run locally -> provide root-level
  scripts and clear environment variables for API and site URLs.
- BFF/session behavior can duplicate security concerns -> API remains the
  session authority and BFF only adapts browser transport.
- Removing `customers.nss` is a breaking persistence migration -> create an
  explicit Alembic migration and update tests/specs in the same change.
- Imported demo UI may carry inaccurate product language -> treat import as a
  visual base and replace copy that promises points, rewards, OAuth, or admin
  behavior not implemented by this MVP.

## Migration Plan

1. Move current API files into `api/` and adjust tooling, imports, tests, and
   README commands.
2. Import `demo-rewards/frontend` into `site-frontend/` and remove demo-only
   backend coupling.
3. Add `site-backend/` with minimal web routes and API client configuration.
4. Add API auth/customer registration persistence and migrations, including
   removal of customer NSS requirements.
5. Connect registration/login forms through the site backend to the API.
6. Add integration coverage for the registration transaction, login, cookies,
   duplicate email/CURP, mandatory consent, and validation status access.

Rollback strategy: the API move should remain a mechanical commit boundary.
Before applying production migrations that remove `customers.nss`, keep database
backups or Neon branch rollback available. Site import can be reverted without
changing persisted data as long as API migrations are not applied.

## Open Questions

- What is the canonical terms and conditions version string for the first
  launch?
- Should successful registration auto-login the customer or redirect to login?
- Should the API require email verification before showing the customer
  dashboard, or is email verification a later change?
- The concrete deployment target remains selectable, but it must expose the
  Astro same-origin `/api/v1/*` route and allow its server runtime to reach
  `site-backend` through `SITE_BACKEND_BASE_URL`.
