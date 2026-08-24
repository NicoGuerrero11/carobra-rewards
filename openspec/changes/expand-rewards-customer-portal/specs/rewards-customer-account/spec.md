## ADDED Requirements

### Requirement: The account experience must distinguish identity from Rewards preferences
The portal SHALL show safe API-owned identity data separately from site-backend-owned Rewards communication preferences. It MUST NOT let the site backend directly modify API-owned identity, credentials, or consent history.

#### Scenario: Customer opens Account
- **WHEN** an authenticated customer opens the account menu
- **THEN** the portal shows their safe profile summary, preference controls, security guidance, and support access without exposing Rewards ID or provider evidence

### Requirement: Rewards preferences must be authenticated and auditable
The system SHALL allow a customer to update only supported Rewards communication topics and channels. Preference updates MUST validate bounded values, retain an update timestamp, and apply only to the authenticated customer.

#### Scenario: Customer disables learning updates
- **WHEN** the customer saves a supported preference that disables learning notifications
- **THEN** the system persists the preference for that customer without disabling mandatory security or account-status communication

### Requirement: Security operations must remain API-owned
The portal SHALL route password, session, and identity operations to API-owned contracts when available and SHALL otherwise provide support guidance rather than simulating a successful change.

#### Scenario: Password change is unavailable
- **WHEN** no password-change contract is enabled
- **THEN** the portal provides a safe support path and does not display a local password form that cannot update API credentials
