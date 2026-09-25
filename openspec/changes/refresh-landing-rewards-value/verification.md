# Verification — 2026-09-25

## Delivered

Replaced the legacy `#beneficios` four-card grid with `PublicRewardsValue.astro`: centered compact heading, static five-level illustration in existing level colors, three concise messages and one registration link. The two desktop columns stack on mobile, where the levels become a vertical list. No customer balance, selected level, fabricated completion or unlock thresholds are shown. No new scripts, remote assets or dependencies were introduced.

Kept the anchor and placement between learning and how-it-works. Prior uncommitted landing changes were preserved. No backend/production database access, reward-rule changes, commit, deployment, sync or archive.

## Checks

- Six landing Playwright suites (value, learning, coupon brands, products, institutional video and landing regression): **88 passed** across desktop and mobile Chromium with mock backend services.
- New tests cover exact level order, three messages, one registration action, preserved section order, absence of legacy chart and fabricated account states, no API requests, keyboard activation and focus, no-JS behavior, 320/390/768/1440px reflow and 200% root text sizing at 320px.
- `npm run build`: passed. Astro checked 82 files with 0 errors, warnings or hints. The installed Vercel adapter still emits its pre-existing warning about local Node 26 and Node 18 fallback; runtime configuration was not changed.
- `openspec validate refresh-landing-rewards-value --strict`: passed.
- `git diff --check`: passed.

## Visual review

Reviewed the live local section at 1440, 390 and 320px. Desktop keeps the full section around 610px tall. All five level names stay visible; narrow mobile uses a vertical list with no horizontal scrolling. Verified the final registration action at narrow width; hid only the development toolbar for the final mobile QA screenshot, without changing app code.

Ephemeral evidence:
- `/tmp/carobra-rewards-value-1440.png`
- `/tmp/carobra-rewards-value-390.png`
- `/tmp/carobra-rewards-value-320.png`

The illustration describes program levels, not a personalized progression calculation. Actual eligibility continues to be determined by existing authenticated flows.
