# Verification — 2026-09-21

## September 24 update — provider libraries and Bronze wellness

- Owner clarified that all route-defined courses belong to Cursos (activity 2), including the 11 wellbeing-themed Gold selections. Separation now uses server-owned activity origin, not topic category. Original course/chapter IDs and stored progress keys are unchanged. Cumulative Cursos totals remain 12 / 37 / 91 / 173 / 249.
- Refreshed the complete activity 1 inventory through read-only GET pagination: 116 posts, 70 videos and 46 text articles. All are in Bienestar from active Bronze upward. Invited users have preview only; blocked/inactive users cannot open details. The reviewed snapshot does not crawl Bonda on every page load or automatically admit future posts. Live events are not included.
- Articles render escaped normalized text and the official image, without a Vimeo player or video progress. Article progress endpoints reject writes. Videos reuse the existing manual/80%-coverage behavior. Tests prove a moved course retains its existing completion and a Bronze wellness video can record completion without changing that course.
- Backend: 244 tests, 237 passed, 7 existing PostgreSQL tests skipped without TEST_DATABASE_URL; no failures. Initial sandbox run could not bind test ports; the permitted rerun passed. Frontend: 5 contract tests and 22 desktop/mobile learning/progress tests passed. Astro check: 62 files, no diagnostics. Frontend/backend builds and OpenSpec strict validation pass; the previously documented local Node/Vercel runtime warning remains.
- Real local Titanio session: authenticated catalog HTTP 200 with 249 Cursos and 116 accessible Bienestar entries. Wellness page HTTP 200, 24 initially visible cards out of 116, no desktop/mobile overflow. Article 61 returns 22 text paragraphs and no player; wellness video 13 and moved Gold course 273 return valid player views (all HTTP 200). This verifies metadata/views, not actual video playback. First three official video thumbnails also return image/jpeg HTTP 200. No customer progress was written in this live check.
- Local backend restarted on port 3001 with the existing configuration and courses enabled; Astro remains on 4321. No migration, customer-data change, deployment, commit, sync or archive. Tasks 7.1–7.3 complete; overall 15/16. Existing task 4.3 stays open for actual media playback/domain checks and all six real customer profiles.

## September 23 follow-up — remove text search

- Removed search input and its client-side logic from Cursos and Bienestar. Category/access controls retain responsive layout, initial filtering, pagination and empty states.
- Astro check: zero diagnostics. Contracts: 5 passed. Courses Playwright: 8 passed across desktop/mobile, including assertions that both catalogs have no search box. OpenSpec strict validation and whitespace checks pass.
- Task 6.1 complete; overall 12/13. The existing live-playback verification task 4.3 remains open.

## September 23 update — Cursos / Bienestar gateway

- Active checkout is now `/Users/nicolasguerrero/work/carobra-rewards/.tmp/carobra-redesign-runtime`, branch `codex/redesign-app-carobra-brand`; the old temporary checkout below is historical.
- The owner restored database service by upgrading Neon. Real Titanio login and authenticated local pages now succeed; the quota blocker below describes September 21, not the current state.
- Added two entry cards with official Activities images and CAROBRA styles. Whitelisted query destinations split the same approved catalog by final curated category, not provider activity ID. Existing backend permissions and manifest remain unchanged.
- Live Titanio browser check: gateway HTTP 200; Cursos HTTP 200 with 238 cards; Bienestar HTTP 200 with 11 cards. Total remains 249, with no new content admitted.
- Frontend build and Astro check pass (56 files, zero diagnostics); 5 contract tests and 14 desktop/mobile Playwright tests pass. Tests cover entry navigation, loaded official images, isolated catalogs, search, categories, locked previews, denied direct access, invalid selector redirect, chapter switching and return links. Desktop/mobile screenshots visually reviewed.
- OpenSpec strict validation and git diff whitespace checks pass. Local API/BFF/Astro restarted on 8000/3001/4321. No deployment, production data mutation, sync or archive performed.
- Tasks 5.1–5.3 complete; overall 11/12 tasks. Task 4.3 stays open for actual Vimeo playback/domain verification and all six live profiles. Automated player tests use mock media and do not establish real playback.

## Scope and results

- Branch: `codex/redesign-app-carobra-brand`; implementation checkout: `/private/tmp/carobra-local-20260917`. The unrelated main checkout remains unchanged.
- Final presentation matched against the live Activities inventory: 249 approved courses/series, 434 individual video posts. Cumulative totals: Bronze 12, Silver 37, Gold 91, Platinum 173, Titanium 249. Invited preview only. Full mapping and excluded selections: `docs/bonda-courses-reconciliation.md`.
- Backend: 232 tests, 226 passed, 6 existing database integration tests skipped because `TEST_DATABASE_URL` is not configured. No failures. Includes HTTP session identity binding, anonymous denial, direct locked-course denial, six level profiles, safe provider failures and authorization before shared cache reads.
- Frontend contracts: 5 passed. Playwright: 12 passed across desktop and mobile (6 Courses cases plus 6 existing portal navigation cases), using clearly isolated mock sessions/media. Verified filters, accented search, chapter switching, single iframe, direct locks, retries, login protection and no horizontal overflow. Screenshots reviewed in test-results (generated, ignored).
- Frontend Astro check: 56 files, no errors/warnings/hints. Frontend and backend builds pass. Vercel adapter emits a runtime-version warning with local Node 26; use the repository-required Node 20 and verify deployment runtime separately before any deployment.
- OpenSpec strict validation passes. No sync/archive requested or performed.

## Live provider checks

- One live chapter per level returned valid video metadata: posts 1256, 1425, 481, 380 and 250.
- Full live series Gestión Financiera Personal (1256, 1257, 1275) loaded with exact title/ID checks in 2106 ms; second in-process detail read used cache (0 ms at millisecond resolution). This isolated test used a simulated authorized journey, NOT a real customer session. It does not measure full-page latency.
- First real Vimeo embed returned HTTP 200 and player HTML. This is not proof of actual media playback or domain permission; browser playback remains pending.
- Metadata snapshot contains three chapters with unknown/zero provider duration (736, 1252, 1410). UI displays “Duración no informada”; no invented duration or completion.

## Environment blocker — do not bypass

The configured database rejects even read-only queries with PostgreSQL error `53000`: “Your account or project has exceeded the quota. Upgrade your plan to increase limits.” This prevents reading real customer levels and can affect login, benefits and the rest of the private portal. No customer data, entitlement, plan or production settings were changed.

Restore database quota/service through the account owner, then verify authenticated navigation for all six profiles and real Vimeo playback. Keep task 4.3 open until that succeeds. Do not mask this as an empty catalog or permit access based on a frontend-selected level.

## Local startup and rollback

API remains on port 8000. BFF is on 3001; Astro is on 4321. Courses enabled only for the local BFF process using `BONDA_COURSES_ENABLED=true`; the checked-in default remains false. Existing coupon flags were not altered. Restart BFF from `site-backend` in the implementation checkout with:

```sh
npm run build
BONDA_COURSES_ENABLED=true node --env-file=/Users/nicolasguerrero/work/carobra-rewards/api/.env --env-file=/Users/nicolasguerrero/work/carobra-rewards/site-backend/.env dist/src/server.js
```

Start Astro from `site-frontend`:

```sh
npm run dev -- --host 127.0.0.1 --port 4321
```

No database migrations or writes are needed for this integration. Roll back the feature by restarting BFF with `BONDA_COURSES_ENABLED=false`. Production deployment and configuration changes require separate authorization.
