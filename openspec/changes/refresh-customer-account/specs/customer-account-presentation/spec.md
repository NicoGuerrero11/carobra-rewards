## ADDED Requirements

### Requirement: Compact and accessible account presentation
The authenticated account page SHALL display read-only personal details, notification preferences, security guidance and help using existing Carobra colors, compact typography and responsive panels without changing identity or eligibility rules.

#### Scenario: Desktop and narrow screens
- **WHEN** a customer opens Mi cuenta on desktop or a 320px-wide screen
- **THEN** the main heading is visible below navigation, text has readable contrast, long identity values wrap, and no horizontal overflow occurs
- **AND** all interactive controls are keyboard reachable with visible focus

### Requirement: Truthful preference state and explicit saving
The page SHALL preserve `activity_updates`, `learning_updates` and `product_updates` from the portal and save only those existing fields through the current PATCH endpoint when the customer submits the form.

#### Scenario: Save successful
- **WHEN** the customer changes preferences and submits
- **THEN** controls show a pending state and reject duplicate saves until the response returns
- **AND** success is announced only after an OK response, with saved values retained after reload

#### Scenario: Save fails
- **WHEN** saving encounters a service error, timeout or network failure
- **THEN** the page announces the failure, retains the selected values, and enables a retry without showing success

#### Scenario: Preferences unavailable
- **WHEN** the account projection cannot supply preferences
- **THEN** the page shows an unavailable notice instead of invented enabled defaults or an editable form
- **AND** personal details and help remain available

### Requirement: Safe account help and private rendering
The page SHALL preserve authenticated access and private rendering and direct account help to the existing Help page without presenting placeholder contacts as operational.

#### Scenario: Help navigation
- **WHEN** the customer seeks help with account details or access
- **THEN** the page links to the existing help/support information without submitting a support request or opening an unconfirmed mailto address

#### Scenario: Anonymous access
- **WHEN** a visitor without an authenticated session opens Mi cuenta
- **THEN** they are redirected to sign in and personal details are not rendered
