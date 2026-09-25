# Verification — 2026-09-25

## Scope

Implemented in the running local checkout `.tmp/carobra-redesign-runtime` on `codex/redesign-app-carobra-brand`. The standalone `#catalogo` section now previews nine distinct coupon brands using source-backed artwork. Hero/video, compact product cards, signup links and footer catalog navigation are preserved. No courses, live provider calls, backend changes, production database writes, deployment, commit, sync or archive were included.

## Checks

- Landing, products, institutional-video and coupon-roll Playwright suites: **54 passed**, desktop and mobile Chromium, using mock services.
- Coupon-roll suite repeated three times: **48 passed**. Covers rapid Home/End interruption of smooth scrolling, buttons and keyboard navigation, reduced motion, disabled boundaries, resize, no-JS native scrolling, image fallback, local-only assets, and 320/390/1440px layouts.
- Explicit geometry assertions protect the Benavides lettering viewport from clipping initial letters; side controls remain at least 44px and outside the artwork area.
- `npm run build`: successful; Astro diagnostics **0 errors, 0 warnings, 0 hints** across 77 files. Existing adapter warning remains: local Node 26 is unsupported by the installed Vercel adapter, which reports Node 18 fallback. No runtime/deployment configuration was changed here.
- `npm run test:contracts`: **5 passed**.
- `openspec validate add-landing-coupon-brand-roll --strict`: passed.
- `git diff --check`: passed.
- Nine assets total approximately 84 KB; SVG inspection found no scripts, event handlers, foreign objects or external resource references.

## Visual review

Inspected the first and last desktop groups and mobile layouts at 390px and 320px. Checked full lettering, spacing, contrast, optical sizes, transparent side arrows, visible keyboard focus and absence of horizontal page overflow. Native touch swipe was exercised through Chromium touch events and moved the list horizontally.

Ephemeral local review screenshots (not committed):

- `/tmp/carobra-coupon-roll-GGMIsv/verified-1440.png`
- `/tmp/carobra-coupon-roll-GGMIsv/verified-end-1440.png`
- `/tmp/carobra-coupon-roll-GGMIsv/verified-390.png`
- `/tmp/carobra-coupon-roll-GGMIsv/verified-320.png`

## Publication and follow-up

Provenance and individual coupon mappings are recorded in `site-frontend/public/images/coupon-brands/SOURCES.md`. Original asset bytes are preserved. White-only artwork uses a neutral monochrome CSS treatment; Benavides uses a lettering-only CSS viewport. These are presentation adaptations, not newly verified official dark variants. Partner usage rights and presentation guidelines should be confirmed before public deployment.

This is a curated preview, not proof of universal availability or live redemption. The displayed note retains level/promotion conditions. Pending OpenSpec sync order remains: `simplify-landing-products-catalog` first, then this delta; preserve the separate institutional-video delta.
