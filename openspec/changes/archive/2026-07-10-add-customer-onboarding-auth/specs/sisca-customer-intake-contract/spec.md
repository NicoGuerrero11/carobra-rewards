## MODIFIED Requirements

### Requirement: Rewards must own customer registration for the AFORE MVP
The system SHALL document the target MVP flow so that the customer registers
directly in Rewards. Rewards SHALL own login, register, profile capture,
onboarding, Rewards ID, points, rewards, redemptions, and customer history.
The MVP registration SHALL use email and password for login and SHALL NOT ask
the customer for NSS. SISCA SHALL NOT be documented as the source that sends
complete valid customers to Rewards.

#### Scenario: Customer starts inside Rewards
- **WHEN** readers inspect the target integration flow
- **THEN** the first step is the customer entering Rewards and completing
  registration there

#### Scenario: SISCA is not the owner of onboarding
- **WHEN** readers inspect system responsibilities
- **THEN** SISCA does not own customer onboarding, profile capture, or Rewards
  account creation

#### Scenario: NSS is not part of customer-entered onboarding
- **WHEN** readers inspect the target MVP registration data
- **THEN** NSS is not listed as a customer-entered registration field

### Requirement: Rewards must create a pending SISCA validation after registration
The system SHALL document that once the customer completes the required
registration data in Rewards, accepts terms and conditions, and the account is
created, Rewards stores the profile, stores CURP without hashing it, records
the accepted terms consent, and creates a pending SISCA validation record.

#### Scenario: Registration creates pending validation
- **WHEN** a customer finishes registration in Rewards
- **THEN** Rewards creates a pending SISCA validation for that customer

#### Scenario: Consent is recorded before validation starts
- **WHEN** Rewards creates the pending SISCA validation after customer
  registration
- **THEN** the registration transaction has also recorded terms and conditions
  acceptance for that customer

### Requirement: Rewards must document Rewards-owned mandatory, optional, and validation data separately
The system SHALL document three different categories of information:

- Rewards-owned mandatory registration data: CURP, first name, last name, email,
  phone, password, password confirmation, postal code, state, city, and terms
  and conditions acceptance
- Rewards-owned optional profile data for later product phases
- SISCA validation data used only to evaluate the AFORE operation

The target documentation SHALL NOT place Rewards-owned personal registration
data inside the SISCA payload contract. The target documentation SHALL NOT list
NSS as customer-entered registration data for this MVP.

#### Scenario: Personal data belongs to Rewards registration
- **WHEN** the target data definition is documented
- **THEN** customer personal and profile fields appear under Rewards-owned
  registration or profile data, not under SISCA validation data

#### Scenario: Validation data stays separate
- **WHEN** the target data definition is documented
- **THEN** `tipo_movimiento`, `estatus_sf`, and `fecha_traspaso` are documented
  as validation-only data returned by SISCA

#### Scenario: NSS is excluded from registration data
- **WHEN** the target data definition is documented
- **THEN** NSS does not appear as required, optional, or validation-only
  customer-entered registration data for the MVP
