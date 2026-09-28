## ADDED Requirements

### Requirement: Customer birth dates remain optional and self-reported
The customer table SHALL store an optional date-only `birth_date` separately from verified birthday evidence. Adding the field MUST be an additive nullable-column migration with no default, inference from CURP or backfill. Registration, login and authenticated profile responses SHALL retain the supplied date without timezone conversion; existing customer records MUST remain readable with a null date.

#### Scenario: Existing customers after migration
- **WHEN** the nullable column is added
- **THEN** existing customer identity, statuses, identifiers and Rewards records remain unchanged and their new field is null

#### Scenario: Date persists across authentication
- **WHEN** a newly registered customer supplied a birth date and later logs in or reads their own profile
- **THEN** the returned date matches the submitted calendar date

#### Scenario: Birth date is not verified evidence
- **WHEN** a customer supplies the date during registration
- **THEN** the system does not write to verified birthday evidence, issue birthday points or change eligibility based on that date
