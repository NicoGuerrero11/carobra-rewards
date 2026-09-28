# Rewards Public Discovery

## Purpose

Define truthful public discovery of Rewards benefits, products, operation, Carobra identity, and trust before registration.

## Requirements

### Requirement: Public navigation exposes discovery before registration
The public Rewards page SHALL provide five content destinations covering benefits, products, how Rewards works, Carobra identity, and trust while preserving separate sign-in and registration actions.

#### Scenario: Visitor evaluates Rewards before creating an account
- **WHEN** an unauthenticated visitor opens the public page
- **THEN** the primary navigation provides direct anchors to Beneficios, Productos, Cómo funciona, Quiénes somos, and Confianza

### Requirement: Public hero supports an institutional video without fabricating one
The public hero SHALL reserve its primary visual for a 90-second institutional video when an approved URL is configured. When no video is configured, it MUST present an explicit non-video introduction with a useful link and MUST NOT render a broken player or false playback control.

#### Scenario: Institutional video is not configured
- **WHEN** the public video URL is absent
- **THEN** the hero presents a Carobra introduction that links to the institutional section and clearly avoids claiming that video playback is available

### Requirement: Public product discovery communicates concrete options
The public page SHALL present Skandia, Quálitas, Modalidad 40, and Infinity before registration in a keyboard-usable horizontal product collection. Each item MUST remain introductory and MUST NOT imply automatic eligibility, price, approval, or online contracting.

#### Scenario: Visitor explores public products
- **WHEN** the visitor reaches Productos
- **THEN** the page identifies the four proposed product families and provides a customer-safe path to register or contact Carobra

### Requirement: Institutional claims use verifiable official evidence
The public page SHALL describe Carobra with facts available from an official Carobra source and MUST NOT invent a client count, regulatory endorsement, award, or credential. The page SHALL link to the official source that supports the visible claims.

#### Scenario: Visitor reads Quiénes somos
- **WHEN** the public page presents operating history, advisor scale, or institutional relationships
- **THEN** each claim matches the linked official Carobra source and unsupported metrics are omitted

### Requirement: Catalog brands remain clearly prospective until authorized
The public page MAY name proposed catalog brands as upcoming value but MUST NOT use third-party logo artwork without approved assets and rights. Prospective brands MUST be visually and textually distinguished from currently redeemable inventory.

#### Scenario: Third-party logo rights are pending
- **WHEN** the public page previews Amazon, Cinépolis, Soriana, Uber, or Starbucks
- **THEN** it uses text-only brand names under a Próximamente label and does not imply availability or point price
