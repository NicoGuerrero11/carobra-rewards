# Site frontend

Astro SSR site for customer registration, email/password login, and the
authenticated validation-status dashboard. Browser requests use same-origin
`/api/v1` paths and an Astro server route forwards them to the site BFF in
development and production;
the browser does not need the FastAPI URL.

## Setup and development

```bash
cp .env.example .env
npm install
npm run dev -- --host 127.0.0.1 --port 4321
```

- Site: `http://127.0.0.1:4321`
- Expected BFF: `http://127.0.0.1:3001`
- `SITE_BACKEND_BASE_URL` is used by SSR middleware/dashboard reads and by the
  server-side `/api/v1` proxy.

Start FastAPI and `site-backend` before exercising the real local flow. The
session secret remains in the HTTP-only cookie and is not read by frontend
JavaScript.

## Checks and browser tests

```bash
npm run check
npm run build
npm run test:e2e
```

The Playwright suite starts its own deterministic BFF double and Astro server.
It verifies registration, login, authenticated profile/status rendering,
unauthenticated redirect, stable API errors, and desktop/mobile layouts.

With the three real local services already running, execute an end-to-end smoke
against the configured database with:

```bash
SITE_URL=http://127.0.0.1:4321 npm run test:smoke:live
```

The live smoke creates two disposable customers, verifies registration, login,
dashboard/status, and logout in desktop and mobile viewports. Use only a safe
development or test database.

Google OAuth, points, campaigns, benefits, redemptions, and admin operations
are not enabled by this MVP.
