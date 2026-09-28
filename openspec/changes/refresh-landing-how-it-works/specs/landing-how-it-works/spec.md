## ADDED Requirements

### Requirement: The landing explains joining in three concise steps
The public landing SHALL show a centered “Empieza en tres pasos” heading and exactly three ordered steps: “Crea tu cuenta”, “Confirmamos tus productos”, and “Descubre lo que tienes disponible”. The text MUST describe registration, product validation for level assignment, and account-specific points and content availability without promising instant validation or universal access. The section MUST omit the former large cards, quote and any additional call to action.

#### Scenario: Visitor reads how Rewards works
- **WHEN** a visitor reaches the how-it-works section
- **THEN** they can read the three steps in order, with visible numbered circles and concise text
- **AND** there are no additional buttons or links inside that section

### Requirement: Existing landing navigation is preserved
The section MUST keep `#experiencia`, remain between `#beneficios` and `#quienes-somos`, and remain reachable through the existing menu and hero links. Its heading MUST remain visible below the sticky header after anchor navigation.

#### Scenario: Visitor follows an existing link
- **WHEN** the visitor activates “Cómo funciona” in the desktop menu or “Descubre cómo funciona” in the hero
- **THEN** the page navigates to `#experiencia` and shows the new section without obscuring its heading

### Requirement: Steps remain readable without interactive dependencies
The section SHALL use a white background, Carobra typography and blue numbered circles, with horizontal connected steps on desktop and vertical connected steps on mobile. It MUST preserve semantic reading order, work without JavaScript, avoid horizontal overflow at 320px and wider, and introduce no API requests, remote assets or animations.

#### Scenario: Visitor reads on mobile or without JavaScript
- **WHEN** the page is opened at 320px, with enlarged text, or with JavaScript disabled
- **THEN** all three steps and their descriptions remain readable in order without requiring interaction
