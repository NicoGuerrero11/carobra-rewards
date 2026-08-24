## ADDED Requirements

### Requirement: UAT controlled checkpoints must retain scheduled semantics

Rewards SHALL support explicitly authorized UAT-only controlled execution of
H24, D3 and D5 for synthetic test cases. The controlled execution MUST use the
same lifecycle behavior as a scheduled check, record that it is a UAT
controlled run and remain disabled in production. It MUST NOT change the
timing of the normal production scheduler.

#### Scenario: Synthetic UAT case runs the D5 checkpoint

- **WHEN** an authorized UAT operator executes D5 for a synthetic case
- **THEN** Rewards evaluates the case as if 120 hours have elapsed
- **AND** applies the ordinary validation lifecycle transition from the SISCA
  result
- **AND** records a controlled UAT audit event

#### Scenario: Regular production case reaches D5

- **WHEN** a production case reaches its fifth-day validation time
- **THEN** Rewards uses the normal production scheduler
- **AND** no controlled UAT execution path is available
