## Context

The public landing uses four large text cards in a horizontal carousel and embeds a prospective catalog strip inside Productos. The authenticated product page already has sourced Skandia/Quálitas logos and a typographic Modalidad 40 identifier. No Infinity logo exists locally. Prior video edits are pending in the same files and must be preserved.

## Goals / Non-Goals

**Goals:** Logo-first, compact product cards with short copy, usable registration links and a standalone catalog section. Preserve the four public product families and Carobra's visual language.

**Non-Goals:** New course content, public access to protected catalogs, point/eligibility changes, logo fabrication, product removal, contact-flow changes, backend work or deployment.

## Decisions

- Use a small public product component for the four offers, with scoped styling. Reuse existing local Skandia SVG and Quálitas PNG without modifying proportions/colors; recreate the existing Modalidad 40 text treatment in CSS, not as an official institutional logo. Infinity remains a simple text identifier until its official asset is supplied. Do not introduce a network dependency or download uncertain artwork.
- Use a four-column grid on desktop, two on smaller screens and one at very narrow widths. The fixed four-item set does not need carousel controls or horizontal scrolling. Cards are single native links to the existing registration route, with accessible product names, visible focus, a discreet arrow and one short description; no nested controls or repetitive CTA text.
- Remove oversized card headings, category labels, long descriptions and carousel JavaScript. Keep the section title and shorten its introduction without adding financial promises. Existing product details and authenticated offers stay unchanged.
- Move catalog preview to a sibling `section#catalogo` after Productos, with its own heading, upcoming status, text-only brand list and a concise availability disclaimer. Use separate whitespace/background to distinguish it from contracting products; do not add courses yet. Retain existing main navigation, with a catalog anchor link in the footer's exploration list.
- Keep pending video implementation intact, use local-only frontend verification, and test keyboard navigation, 320px wrapping, asset loading and truthful catalog labels.

## Risks / Trade-offs

- Infinity artwork absent → preserve the product with a plain name; disclose limitation to user instead of inventing a logo.
- Third-party product artwork → reuse sourced assets only for the requested local design review; original publication-approval notes remain in SOURCES.md.
- Catalog availability is not confirmed → preserve prospective status and text-only brands, with no redemption actions or invented course counts.
- Existing uncommitted video changes → make scoped edits and rerun video regressions.

## Migration Plan

Frontend-only deployment when separately approved. No data or configuration migration. Roll back this change's product/catalog markup and styles independently of the video.

## Open Questions

Approved Infinity logo and future course-section content remain for later review; neither blocks this layout iteration.
