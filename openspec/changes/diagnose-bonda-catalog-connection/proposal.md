## Why

On 2026-09-25, Bonda rejected coupon and course reads with `AuthorizationException` although the configured key was correct. A separate read confirmed `USER_NOT_FOUND` for the shared technical affiliate; restoring it recovered both catalogs. Operators need to distinguish these failures before a demo or deployment without exposing credentials or provisioning customers.

## What Changes

- Add a bounded, read-only connection-check command for the technical affiliate, a representative coupon, a course chapter and wellness content.
- Return stable, actionable diagnostics and a nonzero exit status when readiness cannot be confirmed.
- Add regression tests for missing affiliates, rejected authorization, transport failures, malformed content and secret redaction.
- Document the incident and an explicitly authorized recovery procedure; never auto-create affiliates.

## Capabilities

### New Capabilities

- `bonda-connection-diagnostics`: Secret-safe operational readiness checks for the existing Bonda integration.

### Modified Capabilities

None. Customer authorization, catalogs, issuance and provisioning policies remain unchanged.

## Impact

Site-backend diagnostic code, CLI/npm scripts, automated tests and the Bonda runbook. No database migrations, customer writes, new dependencies, credentials in Git or public health endpoint.
