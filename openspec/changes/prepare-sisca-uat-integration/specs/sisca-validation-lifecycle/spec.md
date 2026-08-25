## ADDED Requirements

### Requirement: Registration must trigger an initial SISCA validation safely

Rewards SHALL commit the customer, consent and pending validation before it
immediately dispatches an initial SISCA query through the ordinary validation
service and configured gateway without making the registration response wait
for partner latency or retries. A validated result SHALL activate the AFORE
relation and make the resulting validation status available to authenticated
site reads. A pending, no-information or technical result SHALL preserve the
customer as an Invitado with H24 as the next scheduled checkpoint. SISCA
unavailability MUST NOT roll back the committed registration or expose raw
provider data to the site.

#### Scenario: Initial query validates the new customer

- **WHEN** registration commits and SISCA returns a valid accepted AFORE result
- **THEN** Rewards records the SISCA check and opaque correlation evidence
- **AND** activates the customer's AFORE relation
- **AND** publishes the validated status for the site to project the Bronce journey

#### Scenario: Initial query remains pending

- **WHEN** registration commits and SISCA has no information or a temporary result
- **THEN** Rewards records the observed safe outcome
- **AND** keeps the customer in the Invitado journey
- **AND** preserves H24, D3 and D5 scheduling from the original registration time

#### Scenario: SISCA is unavailable after registration commits

- **WHEN** the initial SISCA operation cannot be executed after the customer was stored
- **THEN** registration still succeeds with a pending validation
- **AND** H24 remains eligible for the ordinary or controlled UAT lifecycle

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
