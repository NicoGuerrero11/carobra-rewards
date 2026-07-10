## Why

Rewards now needs its first customer-facing product surface instead of only an
API backend. The MVP must let a customer enter the site, register with
email/password and required profile data, accept terms, log in, and start the
existing Rewards-owned SISCA validation lifecycle without asking for NSS.

The project also needs a clear single-repository architecture before importing
the existing `demo-rewards` landing and auth mockup, so the API, site backend,
and site frontend can evolve independently without splitting repositories.

## What Changes

- Add customer registration with CURP, first name, last name, email, phone,
  password, password confirmation, postal code, state, city, and mandatory terms
  acceptance.
- Add customer login with email and password.
- Add durable authentication records with password hashes and web sessions;
  password confirmation is validated but never persisted.
- Add customer consent persistence for terms and conditions, including accepted
  timestamp and terms version.
- **BREAKING** Remove NSS from customer onboarding and from the required
  customer persistence contract for this MVP.
- **BREAKING** Replace the current customer identity shape that stores a single
  `name` and required `nss` with a Rewards registration shape based on
  `first_name`, `last_name`, contact, location, consent, and CURP.
- Keep FastAPI as the owner of business rules, authentication, customers,
  consents, password hashing, sessions, SISCA validation creation, and Neon
  persistence.
- Organize the repository into separate top-level areas for `api`,
  `site-backend`, and `site-frontend` while keeping a single repo.
- Copy the visual base from `NicoGuerrero11/demo-rewards` `frontend` into the
  site frontend and adapt it to the real Rewards onboarding and login contract.
- Build a site backend as a thin web backend/BFF that handles web-facing
  session/cookie ergonomics, calls the API, and translates API errors for the
  frontend without duplicating business logic.
- Remove or disable demo-only Google OAuth and mock backend behavior from the
  imported site experience unless a later change explicitly adds OAuth.

## Capabilities

### New Capabilities
- `customer-onboarding-auth`: Defines customer registration, login, session
  handling, password rules, terms acceptance, and the atomic creation of
  customer, consent, and SISCA validation records.
- `site-application-architecture`: Defines the single-repository split between
  API, site backend, and site frontend, plus the integration boundaries for
  importing and adapting the existing Astro frontend.

### Modified Capabilities
- `customer-persistence-model`: Removes NSS as a required customer field and
  adds auth, customer profile, location, and consent persistence needed by
  Rewards-owned registration.
- `sisca-customer-intake-contract`: Updates the target registration data to
  match the customer-owned onboarding fields and explicitly excludes NSS from
  customer-entered registration.

## Impact

- Affects repository layout, README/development commands, API import paths,
  test paths, Alembic configuration, and deployment conventions.
- Affects FastAPI modules for authentication, customer registration, session
  management, consent persistence, and SISCA validation creation.
- Affects SQLAlchemy models and migrations for `auth_users`, session storage,
  customer consent, customer profile fields, and removal of `customers.nss`.
- Affects site code by importing `demo-rewards/frontend` into `site-frontend`,
  adapting `/`, `/registro`, and `/login`, and introducing a site backend
  boundary for web calls.
- Requires new API and frontend integration tests for register, login,
  duplicate email/CURP, mandatory terms acceptance, password confirmation, and
  creation of pending SISCA validation.
