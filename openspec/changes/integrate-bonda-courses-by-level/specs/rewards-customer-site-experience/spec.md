## MODIFIED Requirements

### Requirement: Course and product information must use focused destinations
The site SHALL provide a Cursos destination that displays the approved Bonda Activities catalog when enabled, with cumulative level access and preview-only locked content. Before a catalog is enabled it SHALL truthfully communicate its Próximamente state without inventing course inventory, progress, or rewards. The Productos destination SHALL provide existing product status, level impact, customer-safe guidance, commercial discovery, and advisor contact. It SHALL keep advisor contact visible before the product grid at supported desktop widths and reserve product-specific colors consistently. Product reward messaging MUST be described as subject to confirmation unless the portal returns an approved value. These pages MUST NOT promise unapproved points, renewals, recommendations, course availability, or product availability.

#### Scenario: Customer opens Cursos
- **WHEN** the customer follows the Cursos destination before a course catalog is approved
- **THEN** the page presents a prominent Próximamente state without fabricated items or actions

#### Scenario: Customer opens approved Courses
- **WHEN** the approved catalog is enabled
- **THEN** the site renders course cards and a level-authorized chapter viewer

#### Scenario: Customer opens Productos
- **WHEN** the portal contains active, pending, cancelled, or ended product facts
- **THEN** Productos presents customer-safe status and level impact with an advisor contact path and no provider evidence
