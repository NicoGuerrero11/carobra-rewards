# Verification — 2026-09-25

- `npm run build` (frontend): passed, Astro reports 0 errors, 0 warnings and 0 hints. The existing Vercel adapter warning about local Node 26 remains outside this change.
- `npm run test:contracts`: 5 passed.
- `npx playwright test tests/e2e/customer-account.spec.ts tests/e2e/client-portal.spec.ts tests/e2e/customer-help.spec.ts`: 46 passed across desktop and mobile Chromium.
- `openspec validate refresh-customer-account --strict`: passed.
- `git diff --check`: passed.

Browser coverage includes compact headings below the fixed navigation, read-only identity, initial mixed preference values, exact PATCH payload and persistence across reload, pending/duplicate submission handling, service/network/timeout errors and retry, keyboard focus, unavailable data, truthful Help links, anonymous access and a disabled JavaScript state. The no-JavaScript assertion targets the visible child of `noscript` because Playwright intentionally excludes `noscript` from text selection.

Desktop, mobile and 320px screenshots were inspected. Long names and emails wrap without horizontal overflow; text contrast checks meet 4.5:1 and switch hit areas are at least 44px. Existing Carobra typography, brand colors and shared navigation are preserved.

All save operations ran against the isolated mock backend on port 3002, with frontend tests on 4322. No production account or preference records were modified. The existing development server on 4321 remains available. No commit, push, sync or archive was performed for this change; the implementation is ready for visual review before archiving.
