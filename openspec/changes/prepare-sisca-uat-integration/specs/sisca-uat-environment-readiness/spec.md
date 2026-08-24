## ADDED Requirements

### Requirement: Hosting decision must be jointly recorded before provisioning

Rewards SHALL record a joint UAT and production hosting decision before
provisioning the SISCA integration environment. The record MUST identify the
platform, region, operating owner, UAT and production runtime boundaries,
database approach, secret management, outbound network identity, HTTPS,
health monitoring, backups and rollback approach.

#### Scenario: Team approves a hosting model

- **WHEN** Rewards and its technical owners select a deployment model
- **THEN** the decision record names the selected UAT and production approach
- **AND** identifies the network identity SISCA must permit
- **AND** assigns an operating owner and rollback approach

### Requirement: UAT and production runtime data must be isolated

Rewards SHALL deploy UAT and production with separate database endpoints,
credentials, SISCA configuration, secrets and operational logs. A UAT runtime
MUST NOT invoke an unrestricted partner endpoint or use a production Rewards
credential. When SISCA offers only its operational API for controlled tests,
UAT MAY invoke that explicitly approved host only with a test-scoped API Key,
identified test CURPs and the configured host allowlist.

#### Scenario: UAT is configured for SISCA testing

- **WHEN** the UAT runtime starts with a SISCA configuration
- **THEN** it uses only the host and test-scoped authentication approved by SISCA
- **AND** its data and logs remain separate from production

#### Scenario: Unapproved endpoint is mistakenly supplied to UAT

- **WHEN** a UAT configuration attempts to use a SISCA target outside its explicit host allowlist
- **THEN** startup or validation fails safely
- **AND** no outbound production request is made

### Requirement: UAT deployment must be internally verifiable before partner access

Rewards SHALL verify the UAT API deployment, schema migrations, health
endpoint and internal onboarding-to-pending-validation flow before requesting
SISCA connectivity. The verification MUST demonstrate that a synthetic
customer can reach the pending SISCA validation state without exposing the
customer CURP in operational output.

#### Scenario: UAT readiness verification succeeds

- **WHEN** the UAT environment is prepared before SISCA access
- **THEN** schema migrations and the health check succeed
- **AND** a synthetic onboarding reaches pending validation
- **AND** the evidence contains only safe identifiers

### Requirement: Runtime secrets must remain confidential

Rewards SHALL provide SISCA endpoint and authentication values to each runtime
through an approved secret-management mechanism. Source control, diagnostic
output and UAT evidence MUST NOT contain those secret values.

#### Scenario: Operator reviews UAT diagnostics

- **WHEN** a UAT connectivity check emits diagnostic output
- **THEN** the output reports only safe configuration state and opaque request
  references
- **AND** it does not reveal authentication material
