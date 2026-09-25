# SISCA Partner UAT Enablement

## Purpose

Define how Rewards prepares SISCA for controlled UAT execution and confirms
partner readiness before smoke testing.

## Requirements

### Requirement: SISCA must receive a concise controlled-test preparation guide

Rewards SHALL provide SISCA a partner-facing guide that states the
connection information SISCA must provide, the canonical request and response
contract, the synthetic-client matrix, the smoke procedure and the named
technical contact path.

#### Scenario: SISCA prepares controlled production testing

- **WHEN** SISCA receives the guide for controlled testing against its operational API
- **THEN** it can identify the required endpoint, authentication, network,
  response and test-data preparation work
- **AND** it can return the agreed information without needing an internal
  Rewards runbook

### Requirement: The guide must explain accelerated checkpoints in partner terms

Rewards SHALL explain in the SISCA guide that H24, D3 and D5 are three queries
of the same synthetic CURP representing 24, 72 and 120 elapsed hours. The
guide MUST state that the pilot executes those queries in a controlled
accelerated UAT sequence and does not wait for calendar time.

#### Scenario: SISCA prepares staged responses

- **WHEN** SISCA builds its synthetic client matrix
- **THEN** it provides the expected response for each test CURP at H24, D3 and
  D5
- **AND** it understands that Rewards will request the three checkpoints in an
  accelerated sequence

### Requirement: SISCA readiness must be confirmed before the smoke test

Rewards SHALL request a written controlled-test readiness confirmation from SISCA before
the smoke test. The confirmation MUST include endpoint, authentication method,
network allowlisting status, named contact, one approved smoke CURP, response
matrix location and applicable request limits.

#### Scenario: SISCA declares itself ready

- **WHEN** SISCA has completed its UAT preparation
- **THEN** it supplies all required readiness information through the agreed
  secure channel
- **AND** Rewards schedules the smoke test only after validating completeness
