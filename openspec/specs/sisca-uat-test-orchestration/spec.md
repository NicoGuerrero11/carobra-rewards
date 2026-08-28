# SISCA UAT Test Orchestration

## Purpose

Define controlled UAT checkpoint execution, evidence collection, and pilot
gates for the SISCA integration.

## Requirements

### Requirement: UAT controlled checkpoints must be explicitly authorized

Rewards SHALL provide an explicitly authorized UAT-only mechanism to run H24,
D3 and D5 validation checkpoints for synthetic pilot cases. The mechanism MUST
use a controlled UTC clock and map H24, D3 and D5 to elapsed periods of 24, 72
and 120 hours respectively. It MUST be disabled in production.

#### Scenario: Authorized UAT operator runs the D3 checkpoint

- **WHEN** an authorized operator runs a synthetic UAT case at D3
- **THEN** the validation executes as if 72 hours have elapsed
- **AND** the execution is marked as a controlled UAT run
- **AND** the audit trail records the operator, checkpoint and time

#### Scenario: Production operator attempts to accelerate a checkpoint

- **WHEN** a production runtime receives a controlled-checkpoint request
- **THEN** the request is rejected
- **AND** normal production scheduling remains unchanged

### Requirement: Accelerated checks must preserve the SISCA validation path

Rewards SHALL route a controlled UAT checkpoint through the same validation
service, SISCA gateway, response normalization, retry behavior and lifecycle
transitions used by the regular validation flow. A controlled check MUST NOT
bypass terminal-state protections for a non-synthetic customer.

#### Scenario: Controlled checkpoint receives a SISCA response

- **WHEN** SISCA returns an allowed, denied, not-found or malformed response
  for a controlled synthetic checkpoint
- **THEN** Rewards applies the normal corresponding lifecycle behavior
- **AND** records a safe audit event with the resulting state

### Requirement: Pilot evidence must support per-case reconciliation

Rewards SHALL maintain a pilot evidence record for every executed client and
checkpoint. Each record MUST include an opaque case identifier, checkpoint,
expected outcome, observed outcome, execution time, resulting validation state
and opaque request correlation reference. It MUST NOT contain a full CURP or
SISCA authentication value.

#### Scenario: Team reconciles a validation discrepancy

- **WHEN** Rewards and SISCA review one pilot result
- **THEN** they can locate the result using the case and correlation references
- **AND** they can compare expected and observed outcomes without sharing a
  full CURP in the evidence tracker

### Requirement: The 100-client pilot must use an initial smoke gate

Rewards SHALL execute five representative synthetic clients before processing
the remaining 95 pilot clients. The remaining batch MUST NOT start until the
smoke results are reconciled between Rewards and SISCA.

#### Scenario: Smoke reconciliation passes

- **WHEN** each of the five smoke clients has the agreed result at required
  checkpoints
- **THEN** the pilot coordinator may authorize the remaining 95 clients

#### Scenario: Smoke reconciliation finds a mismatch

- **WHEN** a smoke client does not have the agreed result
- **THEN** Rewards pauses the remaining pilot batch
- **AND** records and resolves the discrepancy before resuming
