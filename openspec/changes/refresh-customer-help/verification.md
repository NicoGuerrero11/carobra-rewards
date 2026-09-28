# Verification — refresh-customer-help

## Results

- `npm run build`: passed; Astro check reports 0 errors, 0 warnings, 0 hints. The existing Vercel adapter separately warns that local Node 26 is unsupported and its bundle falls back to Node 18; no deployment was performed.
- `npm run test:contracts`: 5/5 passed.
- `npx playwright test tests/e2e/customer-help.spec.ts tests/e2e/notifications.spec.ts tests/e2e/customer-activity.spec.ts tests/e2e/client-portal.spec.ts --workers=2`: 48/48 passed in the final run (14.2s), including 16 new help checks across desktop/mobile.
- `openspec validate refresh-customer-help --strict`: passed.
- `git diff --check`: passed.

## Coverage

- Five topic shortcuts, 15 general FAQs, current course/wellness access and completion guidance, discount/points distinction, and real internal destinations.
- Native keyboard-operated accordions, fragment opening on first load and reload, repeated same-fragment navigation, and no-JavaScript fallback.
- Authenticated active, pending, attention, and inactive contextual guidance; unavailable and empty projections; escaped server text; anonymous login redirect.
- Explicit non-operational support example, no mailto or submit control, separate product link, no client-side mutations while viewing help, private/no-store response.
- Compact typography, header clearance, contrast of at least 4.5:1, and no horizontal overflow at 320px.
- Visually inspected desktop overview and mobile expanded-answer/full-page captures in `site-frontend/test-results/`.

## Boundaries

All browser tests used the isolated backend on 3002 and frontend on 4322, not production data. Existing localhost 4321 runs this branch's frontend and receives the page changes on refresh. No migration, production write, business-rule change, commit, sync, archive, or deployment was performed.

The team must confirm an official support channel before treating the example address as operational.
