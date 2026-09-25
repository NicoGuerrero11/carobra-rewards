# Carobra Brand Application Experience

## Purpose

Define the shared Carobra visual system for product routes while preserving the public landing page and existing product behavior.

## Requirements

### Requirement: Non-landing product routes use the Carobra digital brand system
The frontend SHALL apply a shared Carobra application theme to authentication, customer, administration, and Rewards V2 preview routes. The theme MUST use digital equivalents of the approved Pantone 296C, 301C, 299C, Cool Gray neutrals, and Montserrat typography, and MUST NOT alter the public landing route at `/`.

#### Scenario: Visitor opens the public landing page
- **WHEN** a visitor opens `/`
- **THEN** the existing landing presentation remains unchanged by the application redesign

#### Scenario: User opens a product route
- **WHEN** a user opens an authentication, customer, administration, or Rewards V2 preview route
- **THEN** the page uses the shared Carobra application colors, typography, spacing, and component treatment

### Requirement: Brand application preserves product content and behavior
The redesign SHALL preserve existing copy, semantic information hierarchy, route destinations, form fields, client scripts, API requests, server-owned data, and authorization behavior. Visual changes MUST NOT introduce fabricated content or alter customer and administrator workflows.

#### Scenario: User completes an existing workflow
- **WHEN** the user signs in, registers, navigates the customer portal, or performs an existing administration action
- **THEN** the workflow exposes the same fields, content, requests, and outcomes as before the redesign

### Requirement: Logo usage follows the approved identity rules
The application SHALL render the existing approved Carobra logo without deformation, recoloring, separation, unauthorized effects, content cropping, or repeated-pattern use. Logo placement MUST preserve readable scale and clear surrounding space.

#### Scenario: Logo appears in an application shell
- **WHEN** a customer or administrator sees the Carobra logo
- **THEN** the complete logo artwork keeps its intrinsic aspect ratio, approved colors, and clear presentation

### Requirement: Interface components have a consistent visual hierarchy
Navigation, buttons, forms, cards, tables, metrics, feedback, and status treatments SHALL use shared semantic tokens and consistent interaction states. Brand colors MUST communicate hierarchy, while success, warning, and error colors MUST be reserved for semantic state and MUST include visible non-color meaning.

#### Scenario: User compares interactive elements across routes
- **WHEN** the user moves between authentication, customer, and administration surfaces
- **THEN** equivalent controls have consistent default, hover, focus, active, disabled, and error treatments

### Requirement: The brand-aligned experience remains accessible and responsive
The application theme SHALL preserve semantic headings, keyboard-operable navigation, visible focus indicators, readable contrast, and layouts without horizontal overflow at supported desktop and 320-pixel-or-wider mobile widths. Motion effects MUST respect reduced-motion preferences.

#### Scenario: Keyboard user navigates the application
- **WHEN** a user operates links, menus, forms, and buttons with a keyboard
- **THEN** focus remains visible and every existing interaction remains reachable and understandable

#### Scenario: Customer opens a product route at 320 pixels
- **WHEN** a customer opens a redesigned product route at a 320-pixel viewport width
- **THEN** navigation and content reflow without clipping essential text, actions, or status information
