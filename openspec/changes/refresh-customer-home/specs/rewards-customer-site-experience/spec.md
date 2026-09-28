## MODIFIED Requirements

### Requirement: Rewards home must prioritize current decisions
The Rewards home SHALL present compact current level and balance, approved expiration when available, current eligible benefits, learning continuation or discovery, distinct wellness, product discovery and a bounded recent-activity summary. Only actionable pending prompts and server-confirmed next-level remaining requirements SHALL appear; fabricated progress percentages and future gift-card advertising MUST NOT appear on Inicio. Invited customers SHALL receive a product-discovery action. The page MUST NOT calculate monetary point equivalence or repeat full product, activity, history, help and benefit-detail modules.

#### Scenario: Active customer opens Rewards home
- **WHEN** an active customer has level, balance, catalog, timeline and expiration data
- **THEN** Inicio presents compact real summaries and links to the focused destinations

#### Scenario: Invited customer opens Rewards home
- **WHEN** an invited customer is waiting for product validation
- **THEN** Inicio preserves account state and presents Productos as a useful destination without inventing access or credited points

#### Scenario: Monetary equivalence is unavailable
- **WHEN** the portal does not return an approved point-to-currency value
- **THEN** Inicio omits monetary equivalence rather than calculating one in the frontend

#### Scenario: Next-level rule is unavailable
- **WHEN** no approved progression rule is returned
- **THEN** Inicio omits step counts and percentages; Titanio is acknowledged without promising another level

### Requirement: Customer pages must preserve truthful server-owned state
Customer pages SHALL derive account facts from the authenticated V2 portal and current course progress and benefit availability from their authenticated module APIs. They MUST NOT use browser storage or frontend fixtures as business authority. A failed portal projection MUST NOT erase independently authorized modules on Inicio.

#### Scenario: Portal state is unavailable
- **WHEN** the authenticated portal cannot be loaded
- **THEN** account facts show an unavailable state without fabricated values, while independently authorized modules and static product discovery remain usable
