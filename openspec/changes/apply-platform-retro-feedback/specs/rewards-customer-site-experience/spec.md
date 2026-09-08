## MODIFIED Requirements

### Requirement: Customer navigation must reflect focused destinations
The authenticated customer shell SHALL present stable desktop destinations for Inicio, Beneficios, Ganar puntos, Productos, Actividad, and Ayuda, while Cuenta remains available from the account menu. The logo SHALL link to Inicio, and the notification control SHALL expose the server-reported unread count when positive. Every authenticated customer, including an invited customer with pending, rejected, cancelled, or attention-required validation, SHALL be able to open those destinations without a validation-based redirect. Gift Cards MUST remain reachable as a benefits subdestination but MUST NOT occupy a permanent top-level navigation position while the customer catalog is unavailable. At narrow mobile widths, the five primary product destinations SHALL appear in a labeled bottom navigation while Ayuda remains available from the account menu.

#### Scenario: Customer navigates from Rewards home
- **WHEN** an authenticated customer opens the customer shell on desktop
- **THEN** the primary navigation exposes Inicio, Beneficios, Ganar puntos, Productos, Actividad, and Ayuda without a separate top-level Gift Cards item

#### Scenario: Customer navigates on mobile
- **WHEN** an authenticated customer opens the shell at a supported narrow width
- **THEN** a fixed bottom navigation exposes the five primary product destinations with meaningful icons and visible text labels

#### Scenario: Customer returns through the logo
- **WHEN** the customer activates the Carobra logo from any authenticated destination
- **THEN** the site opens `/cliente/recompensas`

#### Scenario: Customer has unread notifications
- **WHEN** the portal reports one or more unread notifications
- **THEN** the notification control exposes the numeric unread count in visible text and an accessible label

#### Scenario: Invited customer moves between sections
- **WHEN** an invited customer follows each primary navigation destination
- **THEN** every destination loads its customer-safe invited experience without redirecting to Inicio or a validation-only page

#### Scenario: Customer follows an existing Gift Card deep link
- **WHEN** an authenticated customer opens the existing Gift Card route directly
- **THEN** the route remains customer-safe and provides navigation back to Benefits

### Requirement: Rewards home must prioritize current decisions
The Rewards home SHALL prioritize the customer's current level and balance, the next approved expiration when available, one primary action, current benefit availability, understandable next-level progress, and a bounded recent-activity summary. An invited customer SHALL receive a product-discovery action instead of a passive membership label. The page MUST NOT calculate a monetary point equivalence or repeat full product, activity, history, help, and benefits-detail modules without an approved server rule.

#### Scenario: Active customer opens Rewards home
- **WHEN** an active customer has level, balance, action, product, timeline, and expiration data
- **THEN** the home presents the concise decision summary, the server-reported expiration, and links to focused destinations for additional detail

#### Scenario: Invited customer opens Rewards home
- **WHEN** an invited customer is waiting for product validation
- **THEN** the home preserves visible account state and presents Productos as the next useful commercial destination without inventing credited points

#### Scenario: Monetary equivalence is unavailable
- **WHEN** the portal does not return an approved point-to-currency value
- **THEN** the home omits monetary equivalence instead of calculating one in the frontend

### Requirement: Earning and product information must use focused destinations
The site SHALL provide a Ganar puntos destination that prioritizes a list of customer actions with value and status, followed by supporting profile activity, permanence, product-linked earning explanations, and renewal readiness. Numeric value MUST appear only for actions with approved points. The Productos destination SHALL distinguish existing product status from commercial discovery, use customer language, keep advisor contact visible before the product grid at supported desktop widths, and reserve product-specific colors consistently. Product reward messaging MUST be described as subject to confirmation unless the portal returns an approved value.

#### Scenario: Customer opens Ganar puntos
- **WHEN** the portal contains assigned actions with completion status or approved points
- **THEN** Ganar puntos displays each action, its visible state, and its approved numeric value when present

#### Scenario: Earning value is not approved
- **WHEN** an action or product has no approved point value
- **THEN** the page labels the value as pending or omits it and does not invent a number

#### Scenario: Customer opens Productos
- **WHEN** the portal contains active, pending, cancelled, or ended product facts
- **THEN** Productos presents customer-safe status, level impact, commercial options, and a visible advisor path without provider evidence

## ADDED Requirements

### Requirement: Customer color communicates fixed meaning
The authenticated Rewards experience SHALL reserve the branded gradient for the customer level block on Inicio. Other destination heroes and content surfaces SHALL use clear neutral backgrounds. Gold SHALL indicate points or rewards, navy SHALL indicate primary action, green SHALL indicate currently available or completed state, gray SHALL indicate future or unavailable state, and red SHALL indicate urgent expiration or error. Every state MUST also include visible text independent of color.

#### Scenario: Customer compares screens
- **WHEN** the customer moves between Inicio, Ganar puntos, Productos, and Beneficios
- **THEN** the same semantic meaning uses the same color family and only the Inicio level block uses the branded gradient
