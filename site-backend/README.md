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
codes are `duplicate_email`, `duplicate_curp`, `password_mismatch`, `invalid_birth_date`,
`terms_not_accepted`, `invalid_credentials`, `unauthenticated`, and
`api_unavailable`.

Rewards resource error and cursor-pagination contracts are documented in
[`docs/rewards-http-contracts.md`](../docs/rewards-http-contracts.md). They apply only to
`/api/v1/rewards/*`; the existing authentication and SISCA proxy envelopes remain unchanged.

Release gates, rule/catalog/partner activation, rollback, backfill, and finance reconciliation
are documented in [`docs/rewards-operations-runbook.md`](../docs/rewards-operations-runbook.md).


### Timeout de autenticación

Login y registro usan `AUTH_REQUEST_TIMEOUT_MS` (9000 ms), separado del timeout
general `API_REQUEST_TIMEOUT_MS`. `AUTH_API_RESPONSE_BUDGET_MS` (7000 ms) debe
reflejar `AUTH_REQUEST_TIMEOUT_SECONDS * 1000` de la API. Se rechaza al arrancar
un timeout BFF menor que el presupuesto API + 1000 ms o mayor de 15000 ms.
Los defaults dejan 2 s de margen; ambos servicios deben configurarse de forma
coordinada. El 429 API conserva Retry-After; la falta de respuesta de transporte
hasta el timeout BFF produce 503 sin Retry-After. Ningún cambio local despliega
estos valores ni los calibra con tráfico real.

### PostgreSQL TLS

All runtime and CLI connections use `createDatabase`. TLS verifies the CA,
certificate expiry, and destination DNS name/IP by default. `require`, `verify-ca`,
`true`, and `1` are intentionally strengthened to full verification; use
`sslmode=verify-full` to state the intended policy. Insecure modes (`prefer`,
`allow`, `no-verify`) are rejected. Plaintext needs explicit `sslmode=disable`
(or `ssl=false`/`0`) and a literal `127.0.0.1` or `::1` host; DNS `localhost`
receives no plaintext exception. Isolated local tests must opt in explicitly.

The URL is converted to validated driver fields, never passed to pg for a second
parse. Duplicate/conflicting modes, destination overrides, certificate paths,
`uselibpqcompat`, `sslnegotiation`, and unknown parameters fail before connecting.
Allowed query parameters are `sslmode`/`ssl`, `channel_binding`, `application_name`,
`options`, `client_encoding`, `statement_timeout`, `lock_timeout`,
`idle_in_transaction_session_timeout`, and `connect_timeout` (seconds).

`pg` 8.22 supports **optional** channel binding through `enableChannelBinding`,
but does not enforce `channel_binding=require`. This application rejects
`require`; it does not silently reinterpret it as `prefer`. The default and
`channel_binding=prefer` enable opportunistic SCRAM-SHA-256-PLUS;
`channel_binding=disable` explicitly disables that optional feature while keeping
verified TLS. The Python API does not currently support channel binding at all.

**Selected deployment configuration (sanitized template):**

```text
DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:5432/DB_NAME?sslmode=verify-full&channel_binding=prefer
```

`USER`, `PASSWORD`, `DB_HOST`, and `DB_NAME` are placeholders. Preserve the existing
credentials, actual DNS hostname, port, and database for this service; replace the
reported query `sslmode=require&channel_binding=require` with exactly
`sslmode=verify-full&channel_binding=prefer`. Binding is optional, never required.
An unchanged `channel_binding=require` remains an explicit configuration error.
The Python service uses `sslmode=verify-full` without a binding parameter.

Before a separately authorized deployment, verify the actual runtime's trusted
roots and DNS identity, then coordinate the variable update with the corrected
code release. Changing the query alone does not establish this code's full TLS
policy on the old release. Keep the existing authentication migration and timeout
release steps. This patch does not change Railway/Neon variables or deploy code.

Node's standard trusted roots are used without certificate pinning. Only if an
additional private CA is actually required, supply its reviewed PEM using
`NODE_EXTRA_CA_CERTS` at process startup; do not disable validation or install a
new OS-wide trust root. Confirm the actual DNS hostname and runtime trust store
in an authorized predeployment environment. No production Neon connection has
been tested. The local `database-tls` tests require OpenSSL and use temporary
certificates trusted only by test child processes; they assert that invalid TLS
sends neither startup identity nor password.
