## Context

The approved catalogs share a non-customer technical affiliate. Bonda's content endpoints report the same authorization exception for bad credentials and a missing affiliate. The roster GET distinguishes an explicit `USER_NOT_FOUND`. Existing provisioning switches must remain off.

## Goals / Non-Goals

**Goals:** A repeatable, secret-safe pre-demo/pre-deploy check, actionable diagnostics, automated regression coverage, and an incident recovery runbook.

**Non-Goals:** Automatic remediation, scheduled monitoring, customer provisioning, coupon issuance, database changes, replacing user-facing pages, or promising that a check prevents external deletion.

## Decisions

- Provide `npm run bonda:check` and an independently testable CLI runner. Use configured environment variables only, never credential arguments. Emit JSON with static Spanish messages and exit 0 only when all four checks pass. Configuration errors also receive sanitized output.
- Perform four bounded GETs in parallel: configured technical affiliate, approved coupon 9510, first approved course chapter and first approved wellness video. Validate response shape and expected content identity; representative checks are not a full catalog audit or browser playback test.
- Use `BONDA_AFFILIATE_TOKEN` for the roster read when configured, otherwise the confirmed shared coupon key. Do not enable provisioning or connect to the database. Do not reuse the provisioning application, whose methods can write.
- Only explicit `USER_NOT_FOUND` proves a missing affiliate. A generic 404 or authorization rejection is not proof of deletion or an invalid key. Distinguish access rejection, missing resources, transport errors and invalid responses without echoing upstream messages.
- HTTPS/host allowlists, no redirects, request deadlines, response size limits and fixed endpoints constrain credential-bearing requests. Output excludes keys, full URLs, affiliate codes, customer data and raw exceptions.
- Keep startup behavior unchanged so a Bonda outage cannot stop login or unrelated features. Document how operators use the check as a gate before showing/deploying the integration.

## Risks / Trade-offs

- [External affiliate can disappear after a passing check] → Explain the limitation; run again immediately before a demo/deploy. No automatic re-creation or permission expansion.
- [Roster permission differs from content permission] → Report the per-endpoint outcome rather than claiming the coupon key is invalid; document the separate optional token.
- [Representative content is retired] → Report content unavailable/changed and review the probe with the approved catalog; do not substitute arbitrary content.
- [Credentials in network exceptions] → Emit only constant diagnostic codes/messages, including configuration and unexpected CLI failures.

## Migration Plan

No migration or deployment restart is required. Build the backend and run the new command with the existing environment. Rollback removes the command without affecting runtime integration.
