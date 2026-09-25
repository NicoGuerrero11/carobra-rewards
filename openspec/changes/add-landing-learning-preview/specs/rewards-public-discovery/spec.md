## ADDED Requirements

### Requirement: Public learning discovery previews approved courses and wellbeing
The public landing SHALL provide a standalone compact learning section after the coupon preview. It SHALL separate Cursos and Bienestar, display a curated subset of real approved titles, cover images and minimum-level labels, and offer registration. It MUST preserve route-course level rules and label independent wellbeing content as available from Bronze. It MUST describe availability as conditional on an active eligible account and MUST NOT expose chapter content, playback identifiers, customer data or make promises of points, certification or live classes. Rendering MUST NOT require a Bonda API request.

#### Scenario: Visitor previews learning
- **WHEN** a visitor opens the public landing
- **THEN** the course preview shows approved metadata and correct minimum levels, and signup leads to the existing registration route without exposing protected playback

#### Scenario: Visitor selects wellbeing
- **WHEN** the visitor activates Bienestar
- **THEN** the visible cards come only from the independent wellbeing manifest and carry Bronze access labels, without moving Gold wellbeing-topic courses into that space

### Requirement: Learning preview navigation is compact and accessible
The learning preview SHALL show three cards per desktop viewport, adapt without horizontal page overflow on mobile, and support native touch scrolling with translucent 44px side arrows that do not cover the artwork. Tabs and lists SHALL support keyboard navigation and visible focus. Arrows SHALL reflect boundaries and resize/tab state. Motion SHALL be user-triggered and respect reduced-motion preferences. Without JavaScript both groups SHALL remain readable and scrollable; thumbnail failure SHALL preserve titles and layout.

#### Scenario: Visitor navigates with keyboard or touch
- **WHEN** the visitor changes tabs or browses a list with controls, keyboard or a swipe
- **THEN** the selected tab and available arrow states update correctly and the coupon roll remains independent

#### Scenario: Enhancement or artwork is unavailable
- **WHEN** JavaScript is disabled or a thumbnail cannot load
- **THEN** learning titles and the registration action remain usable without a broken player or misleading playback control
