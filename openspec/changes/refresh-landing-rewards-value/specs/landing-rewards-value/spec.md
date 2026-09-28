## ADDED Requirements

### Requirement: The landing presents concise Rewards value
The public landing SHALL retain the `#beneficios` destination after the learning preview and before `#experiencia`, with a centered compact heading, three short value messages, and exactly one section action labeled “Quiero ser parte” linking to `/registro`. It MUST replace the old capabilities cards, chart and decorative metrics without changing other landing destinations.

#### Scenario: Visitor reviews the reasons to join
- **WHEN** a visitor opens `/#beneficios`
- **THEN** they see “Tu confianza te lleva más lejos”, messages about confirmed products, level-based benefits and visible account progress, and one registration action
- **AND** the how-it-works content remains in the following section

### Requirement: Level visuals are truthful and recognizable
The section SHALL present Bronce, Plata, Oro, Platino and Titanio in order with visible names and recognizable level colors. It MUST NOT display a fabricated personal level, balance, completed progress or unlock threshold. The section MUST NOT require authentication, API requests, scripts or remote images to convey its content.

#### Scenario: Anonymous visitor views the levels
- **WHEN** a visitor reads the level illustration with or without JavaScript
- **THEN** all five program levels are readable in order without implying a selected or completed customer level

### Requirement: Value content remains accessible and responsive
The section SHALL use Carobra typography and colors, two desktop columns and a stacked mobile layout without a carousel or horizontal overflow at 320px and wider. Its heading MUST remain centered, decorative icons MUST be hidden from assistive technology, and its action MUST provide visible keyboard focus and a minimum 44px target height.

#### Scenario: Visitor reads on mobile or uses the keyboard
- **WHEN** the section is viewed on a narrow screen or navigated with the keyboard
- **THEN** all level names and messages remain readable and the registration action can be focused and activated
