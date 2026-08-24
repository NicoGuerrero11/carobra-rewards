## Why

Rewards already contains the SISCA validation adapter, but it is not yet ready
to operate as a deployed UAT integration. SISCA confirmed that controlled
tests will use its operational API and Rewards already received the 100
identified test CURPs. Before connecting, Rewards needs a repeatable deployment,
safe configuration, accelerated validation execution, observable evidence, and
a precise partner-facing preparation guide.

## What Changes

- Define with the Rewards team the hosting and deployment model for both UAT
  and production, beginning with the UAT environment needed for integration
  testing.
- Provision and verify a separate Rewards UAT API deployment, database,
  outbound network identity, secret configuration, migrations, health check,
  and safe operational access.
- Make SISCA validation execution testable in UAT through controlled H24, D3,
  and D5 runs that represent 24, 72, and 120 elapsed hours without waiting the
  real time.
- Add an operational workflow to create the 100 independent synthetic
  onboardings, execute their checks in controlled batches, and preserve
  correlation and outcome evidence without exposing sensitive data.
- Publish a concise SISCA-facing UAT preparation guide that states exactly
  what SISCA must provision, the request/response contract, the synthetic-data
  matrix, and the smoke-test confirmation required before the 100-case run.
- Define the UAT exit criteria and production-enablement gate. The same
  integration code will be promoted or redeployed with production-specific
  configuration only after UAT approval.

## Capabilities

### New Capabilities

- `sisca-uat-environment-readiness`: Selection, provisioning, configuration,
  health verification, and production-promotion readiness for the Rewards API
  environments.
- `sisca-uat-test-orchestration`: Controlled accelerated validation runs,
  synthetic-onboarding batches, evidence capture, and the UAT acceptance gate.
- `sisca-partner-uat-enablement`: Partner-facing SISCA preparation guide,
  connection-smoke procedure, and confirmation package.

### Modified Capabilities

- `sisca-validation-lifecycle`: Add controlled UAT execution semantics for
  H24, D3, and D5 without weakening the normal production checkpoint rules.
- `sisca-validation-query-contract`: Define UAT configuration and smoke-test
  expectations for the existing outbound SISCA query adapter.

## Impact

- **API operations:** deployment target, environment variables, secret store,
  database migrations, health verification, and outbound network configuration.
- **SISCA validation module:** controlled UAT check execution and operational
  evidence, preserving the current outbound API contract and safe logging.
- **Testing:** UAT smoke test, 100-client synthetic test matrix, batch
  execution, correlation verification, and acceptance reporting.
- **Documentation:** SISCA-facing setup guide and internal UAT runbook.
- **External dependency:** SISCA will provide the final endpoint, API Key
  delivery mechanism, authentication header, request/response specification
  and technical error catalog. SISCA already confirmed a 60-request-per-minute
  initial limit, repeated queries and the 100 identified test CURPs.
