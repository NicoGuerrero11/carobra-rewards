## ADDED Requirements

### Requirement: Registration supports an optional self-reported birth date
The registration form reached from the landing and the API SHALL accept an optional `birth_date` calendar date. Missing or null dates MUST preserve the existing registration flow. Supplied values MUST use `YYYY-MM-DD`, represent an actual date from 1900-01-01 through the current Mexico City calendar day, and be validated in the browser and API before persistence. The date MUST NOT by itself verify identity, award birthday points or alter a customer level.

#### Scenario: Customer enters a date
- **WHEN** a customer submits otherwise valid registration data with a valid birth date
- **THEN** the registration persists that date with the customer in the existing atomic transaction

#### Scenario: Customer leaves the optional field empty
- **WHEN** a registration omits the date or submits null
- **THEN** registration continues unchanged and stores no birth date

#### Scenario: Invalid birth date
- **WHEN** a date is impossible, earlier than 1900, in the future or not a date-only value
- **THEN** the browser shows an associated field error and the API independently rejects it before creating records with a safe `invalid_birth_date` outcome

#### Scenario: Accessible input on mobile and desktop
- **WHEN** the customer navigates the registration form
- **THEN** the birth-date input has the visible label “Fecha de nacimiento” without an optional suffix, birthday autocomplete, date bounds and associated error text, and fits within the responsive form while remaining optional
