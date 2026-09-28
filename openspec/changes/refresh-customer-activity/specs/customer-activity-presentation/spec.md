## ADDED Requirements

### Requirement: Activity must use a readable compact branded layout
Actividad SHALL present one compact page heading, separate account/event/movement summaries and clearly separated timeline and points panels. It MUST use neutral surfaces and Carobra typography/color tokens, without oversized promotional heroes, purple backgrounds or pale text on white surfaces.

#### Scenario: Customer reads activity on desktop
- **WHEN** the authenticated portal returns history
- **THEN** the current balance and separate displayed event/movement counts appear above readable history panels, with no combined record total

#### Scenario: Customer reads activity on mobile
- **WHEN** the viewport is 320 pixels or wider
- **THEN** summaries and history reflow without clipped text, overlapping amounts or horizontal overflow

### Requirement: Presentation changes must preserve existing account facts
Actividad SHALL preserve every supplied timeline and movement entry, its description, timestamp and signed point amount. Current balance SHALL come from the portal, not a sum of visible entries. Expiration SHALL appear only when approved. Presentation MUST NOT alter account state, award or consume points, or create records.

#### Scenario: Credits and debits are present
- **WHEN** point movements include positive, negative or zero values
- **THEN** displayed values preserve their signs and amounts, with visible labels independent of color

#### Scenario: History is empty
- **WHEN** the portal returns empty arrays
- **THEN** separate empty states appear while the actual balance remains visible

#### Scenario: Portal is unavailable
- **WHEN** the authenticated data cannot be loaded
- **THEN** the page shows a readable unavailable state and retry action without fabricated history, zero counts or zero balance
