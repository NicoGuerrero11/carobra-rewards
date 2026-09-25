# Verification — 2026-09-25

## Automated checks

- `npm run check` in `site-backend`: passed (TypeScript).
- Focused `bonda-connection-check.test.js`: 29 passed, zero failures.
- `npm test` in `site-backend`: 281 tests, 274 passed, zero failures, seven skipped because `TEST_DATABASE_URL` is not configured. No production database tests or migrations were run.
- `openspec validate diagnose-bonda-catalog-connection --strict`: valid.
- `git diff --check`: passed.

Tests cover four GET-only probes, optional separate roster credentials, explicit missing affiliate versus generic authorization errors, configuration guards, redirects, response size, network failures, timeouts including stalled bodies, content validation and secret-safe CLI exit codes. Even configurations with write flags enabled cannot cause these probes to make a write request.

## Live connection

Executed from `site-backend` with its ignored local environment file and the same `BONDA_COURSES_ENABLED=true` override as the local server:

```bash
BONDA_COURSES_ENABLED=true node --env-file=.env dist/src/rewards/bonda/connection-check-cli.js
```

Result: exit 0, `ready: true`.

| Check | HTTP | Result |
| --- | --- | --- |
| Technical affiliate | 200 | OK |
| Approved coupon sample | 200 | OK |
| Approved course chapter sample | 200 | OK |
| Approved wellness video sample | 200 | OK |

The preflight made only four partner GET requests; no database connection, customer changes, provisioning, emails, redemptions, points or course-progress writes were performed. Credentials and raw partner responses are not included in this evidence.

## Limits

This is an on-demand diagnostic and an operational procedure, not continuous monitoring or automatic affiliate restoration. A passing sample check does not certify every catalog item, local level policy or browser video playback. The runbook therefore retains account-level checks before demos and deployments. The reason the technical identity previously disappeared remains unknown; the new command detects recurrence but cannot prevent external deletion.

No existing application endpoint, runtime configuration or write permission was changed by this diagnostic implementation. The OpenSpec change is complete for this scope and has not been synced or archived.
