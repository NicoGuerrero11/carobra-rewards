# Verification — 2026-09-24

- `npx playwright test tests/e2e/notifications.spec.ts tests/e2e/client-portal.spec.ts --workers=1`: 18 passed across desktop/mobile Chromium.
- Verified bulk and individual persistence across reload in the isolated mock, untouched other-customer state, both unread counters, no automatic marking, disabled loading/empty states, duplicate click suppression, partial failures/retry, network failure, expired-session message, keyboard activation and 320px layout.
- Visually inspected desktop and 320px screenshots: the new branded action appears in the top-right desktop header and wraps below the heading on mobile. Existing page content was preserved.
- `npm run build`: passed; Astro check reported 0 errors/warnings/hints. Existing Vercel adapter warning about local Node 26 / fallback Node 18 remains; no deployment performed.
- `npm run test:contracts`: 5 passed.
- `openspec validate mark-all-notifications-read --strict` and `git diff --check`: passed.
- Existing backend read endpoint already invalidates the current session's customer-context cache. No backend or database migration required.
- No production notifications were marked during verification. No commit, sync or archive performed.

## User-requested visual follow-up

- Replaced legacy portal classes with compact scoped notification presentation matching Activity. Removed oversized headings, pastel gradients, pink indicators and crowded primary-styled individual buttons. Added explicit Sin leer/Leída labels without changing notification content or read persistence.
- Inspected updated desktop and 320px screenshots: compact title, top-right bulk action on desktop, wrapped mobile actions, white panel and readable blue pending rows.
- Final `npx playwright test tests/e2e/notifications.spec.ts tests/e2e/client-portal.spec.ts --workers=1`: **20 passed** across desktop/mobile. Added checks for heading sizes, original content/timestamps, state labels and text contrast >= 4.5:1.
- Frontend build and all **5 contract tests** passed again; the pre-existing adapter warning is unchanged. Strict OpenSpec validation and diff whitespace check passed.
