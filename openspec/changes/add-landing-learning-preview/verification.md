# Verification — 2026-09-25

## Delivered scope

Standalone `#aprendizaje` section immediately below the coupon roll. Six approved course previews and four independent wellbeing previews, separate accessible tabs, three desktop/two tablet/one mobile cards per viewport, translucent side arrows and native horizontal scrolling. Titles, compact category labels, colored minimum-level badges, conditional access copy and the existing registration route; no fake playback actions or full catalog publication.

Implemented in the active local runtime checkout on `codex/redesign-app-carobra-brand`. Preserved prior uncommitted landing work. No Bonda API calls, production database access, changes to customer playback/progress or eligibility, new dependencies, deployment, commit, sync or archive.

## Automated verification

- Landing learning, coupon brands, products, institutional video and landing regression suites: **72 passed** across desktop and mobile Chromium, using mock services.
- Contracts: **6 passed**, including a new cross-manifest check of every public preview's source ID, catalog origin, title, category, level and cover URL. Public metadata contains no chapter/provider playback identifiers or credentials.
- `npm run build`: passed; Astro checked 79 files with no errors, warnings or hints. Existing installed Vercel adapter still warns that local Node 26 is unsupported and reports a Node 18 fallback; runtime configuration was not changed.
- `openspec validate add-landing-learning-preview --strict`: passed.
- `git diff --check`: passed.

Tests cover selected/hidden tab state, keyboard focus and activation, arrow boundaries, immediate Home/End interruption, reduced motion, resize, image failures, no-JS native lists, 320/390/768/1440px layouts, registration destination, independence from the coupon roll and absence of API/player requests before interaction.

## Visual and live-image checks

Inspected desktop course groups (including the last group), wellbeing, and mobile layouts at 390px and 320px. Confirmed the ten real catalog covers load from their existing reviewed CDN URLs. Corrected a global link-color transition that briefly reduced selected-tab contrast. Cards retain legible titles and intentional placeholders when covers fail.

Exercised a native touch gesture through Chromium's touch events at 390px; the learning list moved 534px. Controls remain outside images and at least 44px. No automatic motion or playback.

Ephemeral QA evidence, not committed:

- `/tmp/carobra-learning-preview-hxmG9U/courses-desktop.png`
- `/tmp/carobra-learning-preview-hxmG9U/courses-end.png`
- `/tmp/carobra-learning-preview-hxmG9U/wellness-desktop.png`
- `/tmp/carobra-learning-preview-hxmG9U/courses-390.png`
- `/tmp/carobra-learning-preview-hxmG9U/wellness-320.png`

## Limitations

Preview metadata is intentionally curated, not a live availability check. Changes to catalog approvals need a reviewed update; the contract test detects divergence. Covers load lazily from the public preview CDN with a no-referrer policy; provider image availability is external. Actual content access remains behind existing account-state and level authorization. No public deployment was performed.

## Centered heading follow-up

Centered the heading and introduction with tabs underneath at every breakpoint, preserving cards and carousel behavior. The focused learning suite passed all 18 tests, including explicit alignment checks at 320, 390, 768 and 1440px. Visually inspected the live desktop section with real covers in `/tmp/carobra-learning-preview-centered.png`.
