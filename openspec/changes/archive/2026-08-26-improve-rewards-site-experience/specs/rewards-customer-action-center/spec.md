## MODIFIED Requirements

### Requirement: The portal must provide one truthful next action
The system SHALL select a customer-safe primary action from the authenticated
journey, configured activity assignments, document requests, and learning
assignments. The Rewards home SHALL present that selection as its single
dominant action and MUST NOT repeat the same assignment in another full action
module on the same page. It MUST NOT promise points, level advancement, or
completion credit unless an active approved rule provides that outcome.

#### Scenario: Invited customer has no assigned activity
- **WHEN** an invited customer opens Rewards while product validation remains pending and no other action is configured
- **THEN** the portal explains that Carobra is validating the product and does not ask the customer to repeat registration or contact an internal provider

#### Scenario: Customer has an assigned questionnaire
- **WHEN** an authenticated customer has a pending configured questionnaire
- **THEN** the portal presents the questionnaire once as the primary actionable item with its approved status and no invented point value

#### Scenario: Customer needs additional action detail
- **WHEN** the customer follows the primary action from Rewards home
- **THEN** the site routes to the focused authenticated destination or section that owns the assignment
