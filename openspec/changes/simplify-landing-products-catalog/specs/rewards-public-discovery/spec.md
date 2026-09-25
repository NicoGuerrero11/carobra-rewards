## MODIFIED Requirements

### Requirement: Public product discovery communicates concrete options
The public page SHALL present Skandia, Quálitas, Modalidad 40, and Infinity before registration as compact, logo-first cards in a responsive grid. It SHALL reuse existing sourced product artwork where available and use plain typographic identifiers where an approved logo is absent, without fabricating institutional endorsements. Each card SHALL contain one short introductory description and a keyboard-accessible registration link with a clear product name. It MUST NOT imply automatic eligibility, price, approval, point awards, or online contracting.

#### Scenario: Visitor explores public products
- **WHEN** the visitor reaches Productos
- **THEN** the page identifies the four product families with dominant logos or typographic identifiers and a short description
- **AND** the cards preserve the existing `/registro` destination without repeated long CTA copy

#### Scenario: Visitor uses a small screen or keyboard
- **WHEN** the page is viewed at 320px width or navigated with Tab and Enter
- **THEN** every card remains readable and reachable, with visible focus, no horizontal carousel and no page overflow

#### Scenario: Official artwork is unavailable
- **WHEN** an offer such as Infinity has no approved local logo
- **THEN** the card displays its plain name without a fabricated mark, broken image or removal of the offer

### Requirement: Catalog brands remain clearly prospective until authorized
The public page MAY name proposed catalog brands as upcoming value but MUST NOT use third-party logo artwork without approved assets and rights. Prospective brands MUST be visually and textually distinguished from currently redeemable inventory. The catalog preview SHALL occupy a standalone, labeled `section#catalogo` outside Productos, with its own heading, upcoming status and an availability disclaimer. Course content SHALL NOT be added as part of this layout change.

#### Scenario: Third-party logo rights are pending
- **WHEN** the public page previews Amazon, Cinépolis, Soriana, Uber, or Starbucks
- **THEN** it uses text-only brand names under a Próximamente label and does not imply availability or point price

#### Scenario: Visitor reaches the catalog
- **WHEN** the visitor follows the catalog anchor or scrolls past Productos
- **THEN** the catalog appears as an independently labeled section, not a product card or a strip nested inside the contracting-products section
- **AND** no course inventory, access promises or redemption controls are introduced
