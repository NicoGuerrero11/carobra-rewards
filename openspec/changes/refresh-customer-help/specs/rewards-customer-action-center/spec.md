## ADDED Requirements

### Requirement: Help must organize current customer features into accessible topics
The help page SHALL offer five topics covering account/levels, benefits, courses/wellness, points/activity, and products. It SHALL use compact branded typography, native expandable answers, important-text emphasis, and real internal links. It MUST NOT invent points, certificates, response times, or feature availability.

#### Scenario: Customer navigates a topic on desktop or mobile
- **WHEN** the customer selects a topic or opens a question with the keyboard
- **THEN** the matching content is reachable and expandable, all five topics remain available, and the page fits a 320px viewport without horizontal overflow

#### Scenario: Customer needs learning or benefit guidance
- **WHEN** the customer reads the relevant answer
- **THEN** help distinguishes level-segmented courses from wellness available from Bronze, explains saved chapter completion, and directs benefit conditions to their individual detail pages without promising code issuance

### Requirement: General help must survive an unavailable account projection
The authenticated help page SHALL render general answers without relying on a successful portal projection. When available it SHALL preserve server-provided contextual explanations; when unavailable it SHALL show a limited contextual notice instead of hiding general help or inventing account state.

#### Scenario: Account projection is unavailable
- **WHEN** an authenticated customer opens help and portal data is unavailable
- **THEN** all general FAQs and troubleshooting guidance remain accessible without a repeated portal request when middleware already loaded the context

#### Scenario: Account projection is available
- **WHEN** portal data contains contextual help
- **THEN** the page preserves that guidance, safely rendered as text alongside the general topics

### Requirement: Help must distinguish troubleshooting and contact purposes truthfully
The page SHALL provide shortcuts for catalog, playback, progress, and benefit-use issues. Rewards support SHALL be separate from product-information navigation. Until a real support channel is confirmed, `soporte@carobra.com` MUST be visibly labeled as an example and MUST NOT be an operational mailto or submission action.

#### Scenario: Customer follows troubleshooting guidance
- **WHEN** the customer selects an issue shortcut
- **THEN** the matching question is brought into view and opened when JavaScript is available; its native summary remains usable without JavaScript

#### Scenario: Customer views the contact area
- **WHEN** the customer reaches support or product guidance
- **THEN** the support address is explicitly non-operational, no message is sent, and product information links to the existing Products page
