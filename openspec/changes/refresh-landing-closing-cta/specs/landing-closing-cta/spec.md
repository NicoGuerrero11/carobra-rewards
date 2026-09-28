## ADDED Requirements

### Requirement: Compact closing invitation
The landing SHALL end its main content with a compact centered blue section containing the heading `Tu siguiente paso empieza aquí.` and the introduction `Descubre los beneficios, cursos y bienestar disponibles para tu nivel en Carobra Rewards.` It MUST replace the legacy large heading and operational paragraph without adding cards, media or unqualified entitlement claims.

#### Scenario: Visitor reaches the final section
- **WHEN** a visitor reaches the last section before the footer
- **THEN** the approved invitation appears on a subtle corporate-blue gradient, with smaller typography and less height than the legacy block

### Requirement: Clear registration and sign-in hierarchy
The section SHALL show exactly one white primary button-styled anchor `Únete a Rewards` to `/registro`, followed by `¿Ya tienes cuenta?` and a secondary text link `Inicia sesión` to `/login`. Both links SHALL support keyboard activation, visible focus and touch targets at least 44px high.

#### Scenario: Visitor chooses an account action
- **WHEN** a visitor activates either closing link by keyboard
- **THEN** the registration action reaches `/registro` and the sign-in action reaches `/login`, without changing authentication behavior

### Requirement: Preserved navigation and responsive static content
The closing section SHALL retain `#confianza`, its main-menu link and its placement after Quiénes somos and before the separate unchanged footer. It SHALL render without JavaScript or API calls and reflow without clipped content at 320px, 390px, 768px, 1440px and 200% text size.

#### Scenario: Visitor follows the menu anchor
- **WHEN** the Confianza menu link is activated
- **THEN** the closing heading is visible below the sticky header

#### Scenario: Visitor uses a narrow screen or disables scripts
- **WHEN** the page is viewed on mobile, with enlarged text or without JavaScript
- **THEN** the complete invitation and both account links remain readable and usable while the footer remains separate
