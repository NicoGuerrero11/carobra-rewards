## 1. Canonical V2 Runtime

- [x] 1.1 Remove the optional Rewards V2 live-flow configuration and make registration activation unconditional
- [x] 1.2 Make SISCA evidence synchronization and V2 journey transitions unconditional and idempotent
- [x] 1.3 Retire customer-facing V1 account and eligibility endpoints from the site backend

## 2. V2-Only Customer Experience

- [x] 2.1 Remove the frontend V1 account fallback and render an explicit unavailable state when V2 cannot load
- [x] 2.2 Remove retired V1 rewards paths from the frontend BFF allowlist and middleware dependencies
- [x] 2.3 Add contract tests proving the portal never requests or displays V1 rewards data

## 3. Rules and Existing Data

- [x] 3.1 Add a database migration that disables V1 issuance and activates the canonical V2 rule configuration
- [x] 3.2 Implement a dry-run/apply V2 journey backfill with stable idempotency and safe reporting
- [x] 3.3 Add migration and backfill tests for pending, validated, repeated, and historical-ledger cases

## 4. Verification and Promotion

- [x] 4.1 Run backend tests, frontend tests, type checks, and production builds
- [x] 4.2 Verify no runtime or frontend reference can select Rewards V1
- [x] 4.3 Commit and promote the same verified implementation through `uat` and `main` while preserving environment-specific Neon configuration
