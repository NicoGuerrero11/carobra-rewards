## ADDED Requirements

### Requirement: Customer routing must separate validation and Rewards experiences
The site SHALL resolve the authenticated customer's server-side eligibility and expose a validation-status section to ineligible customers and Rewards navigation to eligible customers. Client-side hiding MUST NOT be the only access control.

#### Scenario: Eligible customer enters the customer site
- **WHEN** an authenticated Rewards-eligible customer opens the customer area
- **THEN** the site presents the Rewards summary and its navigation

#### Scenario: Pending customer enters a Rewards URL
- **WHEN** an authenticated pending customer navigates directly to a Rewards page
- **THEN** the site presents the validation experience without leaking balance, catalog, or movement data

### Requirement: Rewards summary must prioritize actionable account information
The summary SHALL display available points, next-expiring points and date, selected or suggested goal when configured, recent movements, earning opportunities, benefit availability, and the reusable personal referral link when available from API data. It MUST NOT repeat the AFORE relation status after eligibility has already been resolved.

#### Scenario: Render an eligible account summary
- **WHEN** the eligible customer opens the Rewards summary
- **THEN** the page renders persisted account values and does not initialize authoritative state from browser storage

#### Scenario: Render the referral action in the summary
- **WHEN** an eligible customer has an available personal referral link
- **THEN** the page presents one link-and-copy section without a separate referral points balance, metrics, progress, or navigation destination

### Requirement: Ways-to-earn content must communicate real conditions
The customer experience SHALL show enabled behaviors with point values, conditions, progress, and completion state. Disabled or unconfigured partner behaviors MUST NOT be presented as currently earnable.

#### Scenario: Monthly interaction rule is disabled
- **WHEN** the qualifying-action definition has not been approved
- **THEN** the site does not promise that a login or action will issue the monthly points

### Requirement: Catalog and redemption UI must expose truthful availability
Catalog views SHALL identify point price or free-entitlement mode, eligibility, inventory state, validity, and fulfillment status. Redemption controls SHALL handle stable API outcomes without optimistic balance mutation.

#### Scenario: Inventory disappears before confirmation
- **WHEN** the API returns `inventory_unavailable` for a submitted redemption
- **THEN** the site preserves the displayed authoritative balance, explains the outcome, and refreshes availability

### Requirement: Customers must be able to inspect movements and redemption status
The site SHALL provide chronological, paginated access to point credits, consumption, expiration, adjustments, and refunds plus the lifecycle state of the customer's redemptions. Entries SHALL use plain-language source labels without exposing internal secrets or other customers.

#### Scenario: Inspect a refunded redemption
- **WHEN** a customer opens movements after a refund
- **THEN** the site shows the original consumption and compensating refund as distinct entries

### Requirement: Rewards pages must be responsive and accessible
The experience SHALL remain usable at desktop and mobile widths, use semantic navigation and controls, expose keyboard focus, and avoid horizontal overflow for supported content. Status and availability MUST NOT rely on color alone.

#### Scenario: Use Rewards on a narrow mobile viewport
- **WHEN** a customer opens the summary at a 320-pixel viewport width
- **THEN** navigation and content reflow without clipped controls, hidden essential text, or horizontal scrolling
