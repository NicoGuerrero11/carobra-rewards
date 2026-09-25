## Why

Mi cuenta still uses the oversized headings, pale text and spacious panels from the previous customer design. It should follow the compact Carobra styling now used in Activity, Notifications and Help while keeping account data and notification preferences reliable.

## What Changes

- Present personal details, notification preferences, security guidance and help in a compact, responsive layout using existing Carobra design tokens.
- Keep the existing three preference fields and save action, with accessible controls and clear saving, success, unavailable and failure states.
- Route account help through the existing Help page instead of presenting an unconfirmed support email as operational.
- Add isolated browser coverage and desktop/mobile visual verification; do not change production data.

## Capabilities

### New Capabilities

- `customer-account-presentation`: Readable and responsive account presentation, truthful preference states and contextual help navigation.

### Modified Capabilities

None. Existing account identity and preference API contracts remain unchanged.

## Impact

- Frontend route `/cliente/perfil`, page-specific styling and isolated frontend tests.
- No new dependencies, database migrations, changes to level eligibility or production writes.
