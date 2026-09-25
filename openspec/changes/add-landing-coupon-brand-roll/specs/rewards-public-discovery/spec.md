## MODIFIED Requirements

### Requirement: Catalog brands remain clearly prospective until authorized
The public page SHALL distinguish curated brands mapped to approved Bonda coupons from prospective gift-card inventory. Coupon brands SHALL appear in a standalone labeled `section#catalogo`, with official source-documented wordmark-oriented artwork and a clear statement that availability depends on the customer's level and each promotion's conditions. The preview MUST NOT claim universal eligibility, specific discounts, live redemption or gift-card availability. Any future gift-card preview SHALL remain explicitly prospective and MUST NOT use unapproved artwork or imply availability or point prices. This change SHALL NOT introduce courses or expose protected catalog data.

#### Scenario: Visitor previews coupon brands
- **WHEN** the visitor reaches the catalog section
- **THEN** a compact horizontal collection identifies selected brands present in the approved coupon mappings
- **AND** official lettering is shown without large cards, fabricated typography or discount claims
- **AND** the preview states that benefits depend on level and promotion conditions

#### Scenario: Artwork is sourced
- **WHEN** a brand image is included
- **THEN** its source is a documented official brand website or the asset CDN referenced by that website
- **AND** its geometry and original file remain intact, with an accessible brand name; white-only source variants use an explicitly documented neutral monochrome presentation for contrast
- **AND** unavailable images fall back to readable names instead of broken artwork

#### Scenario: Prospective gift cards are not misrepresented
- **WHEN** the coupon preview replaces the former Amazon, Soriana, Uber and Starbucks list
- **THEN** those proposed gift-card entries are not presented as integrated coupons
- **AND** no future gift-card inventory or redemption action is introduced

## ADDED Requirements

### Requirement: Coupon brand roll supports accessible manual browsing
The roll SHALL support translucent side arrow buttons, native touch scrolling and keyboard navigation without moving automatically. Controls SHALL identify their direction, reflect the current scroll boundaries and preserve visible keyboard focus. Navigation SHALL respect reduced motion, update on resize, remain contained at 320px width and remain usable without JavaScript. Public rendering SHALL NOT depend on a Bonda request or expose any customer or provider secrets.

#### Scenario: Visitor browses with side arrows
- **WHEN** a visitor activates the next or previous arrow
- **THEN** the collection scrolls to another group without covering its wordmarks
- **AND** controls at unavailable boundaries are disabled

#### Scenario: Visitor uses keyboard or mobile
- **WHEN** the viewport is focused and arrow keys, Home or End are used, or the visitor swipes on mobile
- **THEN** every brand can be reached without page overflow or loss of focus

#### Scenario: Motion or JavaScript is restricted
- **WHEN** reduced motion is enabled or JavaScript is unavailable
- **THEN** the list remains readable and scrollable without animation or nonfunctional visible custom controls
