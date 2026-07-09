## ADDED Requirements

### Requirement: Rewards must own customer registration for the AFORE MVP
The system SHALL document the target MVP flow so that the customer registers
directly in Rewards. Rewards SHALL own login, register, profile capture,
onboarding, Rewards ID, points, rewards, redemptions, and customer history.
SISCA SHALL NOT be documented as the source that sends complete valid customers
to Rewards.

#### Scenario: Customer starts inside Rewards
- **WHEN** readers inspect the target integration flow
- **THEN** the first step is the customer entering Rewards and completing
  registration there

#### Scenario: SISCA is not the owner of onboarding
- **WHEN** readers inspect system responsibilities
- **THEN** SISCA does not own customer onboarding, profile capture, or Rewards
  account creation

### Requirement: Rewards must capture and store CURP directly without hashing it
The system SHALL document CURP as a Rewards-captured field used for SISCA
validation. Rewards SHALL store CURP without hashing it in the target flow.
The target documentation SHALL NOT rely on `curp_hash`.

#### Scenario: CURP is captured in Rewards
- **WHEN** the customer completes registration in Rewards
- **THEN** CURP is entered directly by the customer in Rewards

#### Scenario: CURP remains unhashed
- **WHEN** the target data model is documented
- **THEN** CURP is stored in a directly usable form for SISCA validation rather
  than as `curp_hash`

### Requirement: SISCA must be limited to AFORE validation data only
The system SHALL document SISCA as a validation source that returns only the
minimum AFORE validation data needed by Rewards: `tipo_movimiento`,
`estatus_sf`, and `fecha_traspaso`. SISCA SHALL NOT be documented as sending
complete customer profiles, benefits, points, rewards, or onboarding data.

#### Scenario: Validation response contains only SISCA validation fields
- **WHEN** the conceptual SISCA contract is documented
- **THEN** the documented response contains `tipo_movimiento`, `estatus_sf`, and
  `fecha_traspaso`

#### Scenario: SISCA does not send customer-owned Rewards data
- **WHEN** readers inspect the target responsibilities
- **THEN** SISCA is not described as sending rewards balances, benefits,
  rewards, redemptions, or customer profile ownership data

### Requirement: Rewards must create a pending SISCA validation after registration
The system SHALL document that once the customer completes the required
registration data in Rewards, Rewards stores the profile, stores CURP without
hashing it, and creates a pending SISCA validation record.

#### Scenario: Registration creates pending validation
- **WHEN** a customer finishes registration in Rewards
- **THEN** Rewards creates a pending SISCA validation for that customer

### Requirement: Rewards must use exact elapsed validation checkpoints
The system SHALL document validation checkpoints at 24, 72, and 120 elapsed
hours starting when the customer completes registration in Rewards. Rewards MAY
keep the case pending at the first two checkpoints while waiting for the AFORE
operation to reach `ACEPTADA PROCESAR`.

#### Scenario: Validation checkpoints start after registration completion
- **WHEN** the customer completes registration in Rewards
- **THEN** Rewards schedules `H24`, `D3`, and `D5` at 24, 72, and 120 elapsed hours

#### Scenario: Missing information before the window ends does not cancel the case
- **WHEN** Rewards consults SISCA at `H24` or `D3` and no information is found
- **THEN** the case stays pending and is neither rejected nor cancelled

### Requirement: Rewards must interpret SISCA statuses according to MVP rules
The system SHALL interpret SISCA validation results according to the following
documented rules:

- `ACEPTADA PROCESAR`: the operation is considered correct and Rewards MAY
  activate the customer if `tipo_movimiento` and `fecha_traspaso` also satisfy
  the MVP rules
- `ACEPTADA OPERACIONES`: the case is temporary pending, must not be rejected,
  and must not be cancelled during the validation window
- `CANCELADA`: the case is cancelled and Rewards must notify the team

#### Scenario: Accepted to process can activate the customer
- **WHEN** SISCA returns `estatus_sf = ACEPTADA PROCESAR`
- **THEN** Rewards may activate the customer once the MVP rules for
  `tipo_movimiento` and `fecha_traspaso` are satisfied

#### Scenario: Accepted operations stays pending
- **WHEN** SISCA returns `estatus_sf = ACEPTADA OPERACIONES`
- **THEN** Rewards keeps the case pending within the validation window and does
  not reject or cancel it

#### Scenario: Cancelled status ends the case
- **WHEN** SISCA returns `estatus_sf = CANCELADA`
- **THEN** Rewards cancels the case and notifies the team

### Requirement: Rewards must define post-window outcomes explicitly
At the `D5` checkpoint, the system SHALL document these outcomes:

- if SISCA returns `ACEPTADA PROCESAR`, Rewards activates the customer
- if SISCA returns `CANCELADA`, Rewards cancels the case and notifies the team
- if SISCA still returns no information, Rewards cancels the case and notifies
  the team
- if SISCA still returns `ACEPTADA OPERACIONES`, Rewards marks attention
  required and notifies the team

#### Scenario: No information at D5 cancels the case
- **WHEN** the `D5` check returns no information
- **THEN** Rewards cancels the case and notifies the team

#### Scenario: Accepted operations at D5 escalates the case
- **WHEN** the `D5` check still returns
  `ACEPTADA OPERACIONES`
- **THEN** Rewards marks the case as requiring attention and notifies the team

### Requirement: Rewards must document Rewards-owned mandatory, optional, and validation data separately
The system SHALL document three different categories of information:

- Rewards-owned mandatory registration data
- Rewards-owned optional profile data
- SISCA validation data used only to evaluate the AFORE operation

The target documentation SHALL NOT place Rewards-owned personal registration
data inside the SISCA payload contract.

#### Scenario: Personal data belongs to Rewards registration
- **WHEN** the target data definition is documented
- **THEN** customer personal and profile fields appear under Rewards-owned
  registration or profile data, not under SISCA validation data

#### Scenario: Validation data stays separate
- **WHEN** the target data definition is documented
- **THEN** `tipo_movimiento`, `estatus_sf`, and `fecha_traspaso` are documented
  as validation-only data returned by SISCA

### Requirement: Rewards must document target internal states separately from SISCA raw values
The system SHALL document Rewards-managed case states separately from raw SISCA
response values. The target documentation SHALL include at least pending,
validated or active, cancelled, and attention-required internal case meanings
without treating SISCA raw values as the only internal state model.

#### Scenario: Internal pending state differs from SISCA raw values
- **WHEN** Rewards is waiting within the validation window
- **THEN** the case is documented as pending even if SISCA has not returned
  information yet or has returned `ACEPTADA OPERACIONES`

### Requirement: Legacy simulated intake documentation must be treated as historical
The system SHALL document the currently implemented simulated intake flow as
historical or technical context only. It SHALL NOT be presented as the target
integration criterion for the MVP.

#### Scenario: Simulated intake stays non-canonical
- **WHEN** readers inspect the current simulated endpoint documentation
- **THEN** it is clearly marked as historical and superseded by the Rewards-led
  registration plus SISCA validation model
