# Site backend

Thin TypeScript/Node BFF for the customer-facing site. FastAPI remains the
owner of registration, authentication, sessions, customer data, SISCA state,
and database writes. This service only proxies the web contract, forwards the
API session cookie, and normalizes API errors for forms.

## Configuration

Use `.env.example` as a reference and export the variables before starting:

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_BASE_URL` | `http://127.0.0.1:8000` | FastAPI origin |
| `SITE_BACKEND_HOST` | `127.0.0.1` | Local bind host |
| `SITE_BACKEND_PORT` | `3001` | Local BFF port |
| `SESSION_COOKIE_NAME` | `carobra_session` | API session cookie to forward |
| `SESSION_COOKIE_SECURE` | `false` | Add `Secure` to browser cookies |
| `SESSION_COOKIE_SAME_SITE` | `lax` | Browser `SameSite` policy |
| `SESSION_COOKIE_PATH` | `/` | Browser cookie path |
| `SESSION_COOKIE_DOMAIN` | unset | Optional browser cookie domain |
| `API_REQUEST_TIMEOUT_MS` | `5000` | FastAPI request timeout |
| `DATABASE_URL` | unset | Carobra PostgreSQL database used by site-backend Rewards migrations |
| `TEST_DATABASE_URL` | unset | Dedicated PostgreSQL database for isolated migration/integration tests |
| `REWARDS_V2_LIVE_FLOW_ENABLED` | `false` | Enables registration → Invitado → SISCA → Bronce in development/test only |

`SESSION_COOKIE_NAME` must match FastAPI's `AUTH_SESSION_COOKIE_NAME`.
The BFF never reads the session value beyond isolating the configured cookie,
and it does not create an independent session.

## Commands

```bash
cp .env.example .env
npm install
npm run check
npm test
npm run build
npm start
```

When `TEST_DATABASE_URL` is configured, `npm test` creates an isolated schema,
round-trips every site-backend migration, exercises database constraints and
relationships, verifies baseline configuration, and drops the schema. The test
refuses to run if `TEST_DATABASE_URL` is the same as `DATABASE_URL`.

`npm start` serves the BFF at `http://127.0.0.1:3001` with the example
configuration. Start FastAPI at `http://127.0.0.1:8000` first. Node does not
load `.env` automatically, so export the file in the shell or provide the same
variables through the process manager before starting outside the defaults.

For the current local V2 integration review, enable the real (non-mock) path
explicitly before migrations and startup:

```bash
export REWARDS_V2_LIVE_FLOW_ENABLED=true
npm run db:migrate
npm run build
npm start
```

The process rejects this internal activation flag when `NODE_ENV=production`.
Production remains disabled until the unresolved level and commercial rules
are approved.

## Web routes

The site calls these same-origin BFF routes; each proxies the matching FastAPI
endpoint:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me`
- `GET /api/v1/me/validation-status`

Errors are returned as `{ "error": { "code", "message" } }`. The stable form
codes are `duplicate_email`, `duplicate_curp`, `password_mismatch`,
`terms_not_accepted`, `invalid_credentials`, `unauthenticated`, and
`api_unavailable`.

Rewards resource error and cursor-pagination contracts are documented in
[`docs/rewards-http-contracts.md`](../docs/rewards-http-contracts.md). They apply only to
`/api/v1/rewards/*`; the existing authentication and SISCA proxy envelopes remain unchanged.

Release gates, rule/catalog/partner activation, rollback, backfill, and finance reconciliation
are documented in [`docs/rewards-operations-runbook.md`](../docs/rewards-operations-runbook.md).
