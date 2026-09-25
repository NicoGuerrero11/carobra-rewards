## ADDED Requirements

### Requirement: Compact institutional presentation
The public landing SHALL preserve `#quienes-somos` and show the compact heading `El respaldo detrás de Rewards.`, the approved brief introduction, and three distinct facts in a semantic definition list. It SHALL show 15 years of experience as confirmed by the user, retain the existing advisor and alliance claims, and remove the legacy oversized heading and blue fact cards.

#### Scenario: Visitor reads the institutional section
- **WHEN** a visitor reaches Quiénes somos
- **THEN** the visitor sees the heading, brief company introduction and facts for 15 years, more than 2,000 advisors and alliances with leading institutions, without added guarantees or personalized account data

### Requirement: One accessible official-site action
The section SHALL expose a single `Conoce Carobra` link to `https://www.carobra.com/`, opening securely in a new tab with accessible disclosure and visible keyboard focus. It MUST NOT add a registration button or alter other sections' actions.

#### Scenario: Keyboard visitor explores Carobra
- **WHEN** a visitor follows the main navigation's Quiénes somos anchor and focuses the section link
- **THEN** the section heading remains visible below the sticky header and the official-site link has visible focus and the expected secure destination

### Requirement: Lightweight responsive credibility facts
The section SHALL present three horizontal fact columns on desktop and stacked rows on small screens, with subtle separators instead of large cards. All content and the link SHALL work without JavaScript, external data requests or new media, and remain readable at 320px and at 200% text size.

#### Scenario: Visitor uses a narrow screen or enlarged text
- **WHEN** the landing is viewed at 320px, 390px, 768px or 1440px, or with 200% text at 320px
- **THEN** the section reflows in reading order without clipped or horizontally overflowing text

#### Scenario: Scripts are disabled
- **WHEN** JavaScript is disabled
- **THEN** the full section and official-site link remain available
