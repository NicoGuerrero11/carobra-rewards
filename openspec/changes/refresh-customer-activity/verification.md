# Verification — 2026-09-24

## Scope

Activity page markup and scoped CSS only. No account mutations, reward calculations, backend changes, migration, deployment, commit or archive performed for this change. The shared mock already contained unrelated changes, which were preserved.

## Results

- `npx playwright test tests/e2e/customer-activity.spec.ts tests/e2e/client-portal.spec.ts --workers=1`: **18 passed** across desktop and mobile Chromium, using isolated mock data on ports 3002/4322.
- All supplied timeline and ledger rows remain visible, with original descriptions, timestamps and signed amounts. Counts are separate and the balance comes from the supplied portal value, not a sum of displayed entries.
- Positive, negative and zero movements have explicit Abono/Cargo/Sin cambio labels. Expiration remains hidden unless approved.
- Empty, unavailable/retry, invited and anonymous states pass. The unavailable state does not fabricate zero summaries.
- Text contrast checks pass at least 4.5:1. Panel backgrounds are white without gradients. The compact title is below the header on initial load. No horizontal overflow or amount/title overlap at 320px.
- Visually inspected generated desktop and 320px screenshots: readable hierarchy, white history panels, navy/blue accents and gold points. Fixed mobile navigation stays available; full-page screenshots capture it at the viewport position.
- `npm run build`: passed, Astro check reported zero errors/warnings/hints. Existing Vercel adapter warning remains: local Node 26 is unsupported and the adapter falls back to Node 18; no deployment was performed.
- `npm run test:contracts`: **5 passed**.
- `openspec validate refresh-customer-activity --strict`: passed.
- `git diff --check`: passed.
- Existing local login at `http://127.0.0.1:4321/login`: HTTP 200. No production login or data writes used for verification.

The first browser run, concurrent with the build, had two unrelated coupon-map failures (16/18 passed). Re-running the complete selection sequentially after the build passed all 18 tests without changing coupon code or weakening assertions.

## Files

- `site-frontend/src/pages/cliente/activities.astro`
- `site-frontend/src/styles/customer-activity.css`
- `site-frontend/tests/e2e/customer-activity.spec.ts`
- `site-frontend/tests/support/mock-site-backend.mjs` (Activity-only fixtures added)
