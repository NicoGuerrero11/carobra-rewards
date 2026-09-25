# Verification — 2026-09-25

## Delivered

Replaced the legacy `#experiencia` split timeline with the static `PublicHowItWorks.astro` component. Centered compact heading, white background, three blue numbered circles, subtle connectors and approved concise copy. Desktop uses three columns; mobile uses vertically connected steps. Removed the large cards, quote and unused route-local timeline data. No new CTA, scripts, remote assets or dependencies.

Kept both incoming anchors and placement between `#beneficios` and `#quienes-somos`. Preserved all earlier uncommitted landing work. No backend, authorization, database, production, commit, deployment, sync or archive actions.

## Automated checks

- Seven landing Playwright suites: **104 passed** across desktop and mobile Chromium with mock backend services.
- Focused tests cover exact three-step copy/order, no added controls or API calls, preserved section order, keyboard activation of menu and hero anchors with heading visibility below the sticky header, no-JS rendering, 320/390/768/1440px layout and 200% root text sizing at 320px.
- Initial enlarged-text tests exposed long-word overflow in the narrow text column. Added scoped `overflow-wrap: anywhere` and reran the full suite successfully without weakening the assertions.
- Final `npm run build`: passed; Astro checked 84 files with 0 errors, warnings or hints. The existing installed Vercel adapter still warns about local Node 26 and its Node 18 fallback; runtime configuration is outside this change and was not modified.
- `openspec validate refresh-landing-how-it-works --strict`: passed.
- `git diff --check`: passed.

## Visual review

Inspected the live section at 1440, 768, 390 and 320px. Desktop section height is approximately 409px; narrow mobile approximately 577px. Steps remain in order with visible connectors and no enclosing cards or extra actions. The development toolbar was hidden only in screenshot capture, not in app code.

Ephemeral screenshots:
- `/tmp/carobra-how-it-works-1440.png`
- `/tmp/carobra-how-it-works-768.png`
- `/tmp/carobra-how-it-works-390.png`
- `/tmp/carobra-how-it-works-320.png`

This is an explanatory presentation, not a live registration progress indicator. Actual account validation and availability remain governed by existing workflows.
