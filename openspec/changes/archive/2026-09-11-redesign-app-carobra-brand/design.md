## Context

The Astro frontend has a shared global stylesheet but its non-landing routes have evolved through multiple visual passes. Named customer and administration components coexist with Tailwind utility colors and route-local styles, producing many unrelated accents and typography choices. The brand manual provides an approved logo, Pantone 296C/301C/299C, Cool Gray 6C, Montserrat support typography, logo construction rules, and diagonal graphic motifs.

The redesign must cover authentication, customer, administration, and Rewards V2 preview routes while leaving `/`, content, APIs, data contracts, route behavior, and business logic unchanged.

## Goals / Non-Goals

**Goals:**

- Establish one scoped digital design system for every non-landing product route.
- Express a modern, trustworthy financial-services identity using the approved Carobra palette and typography.
- Standardize high-use primitives and shells without disrupting existing server rendering or client scripts.
- Preserve responsive layouts, semantic structure, keyboard operation, visible focus, contrast, and status text.
- Make future UI work use semantic tokens instead of introducing new arbitrary brand colors.

**Non-Goals:**

- Redesigning or restyling the public landing page.
- Changing customer-facing copy, navigation destinations, data loading, validation, redemption, or administration behavior.
- Editing or recreating the Carobra logo.
- Embedding an unlicensed Typograph Pro webfont.
- Changing backend services, databases, API contracts, or deployment infrastructure.

## Decisions

### Scope the application theme at the shared layout boundary

`BaseLayout` will identify `/` as the public landing surface and apply a `carobra-app` body class to other rendered product routes. A separate `brand-app.css` file imported after the legacy global stylesheet will own the new theme. This keeps landing styles stable and provides an explicit migration boundary.

Alternative considered: replace the existing global stylesheet in place. Rejected because root tokens and shared primitives are also consumed by the landing page, making regressions difficult to isolate.

### Use semantic web tokens derived from the manual

The application theme will define deep navy, institutional blue, bright cyan, Cool Gray neutrals, semantic success/warning/error colors, typography, radii, spacing, borders, focus rings, and shadows. Brand hierarchy will use navy for structure, institutional blue for primary actions, and cyan for progress or small emphasis. Purple and decorative pink/teal will be removed from application chrome.

Alternative considered: directly replace every hexadecimal value. Rejected because literal substitutions would preserve inconsistency and make later maintenance harder.

### Use Montserrat for interface typography

Montserrat will be loaded as the interface family with robust local/system fallbacks. Typograph Pro remains represented by the approved logo artwork and will only be added as live text if a licensed webfont is supplied later.

Alternative considered: approximate Typograph Pro with another heavy display font. Rejected because the manual explicitly protects the modified logo typography and an approximation could imply a non-approved brand asset.

### Preserve markup and logic, enhance existing semantic classes

Existing customer and administration class names will be restyled through the scoped application stylesheet. Page edits will be limited to theme hooks, shared layout treatment, and removal of conflicting inline visual utilities where necessary. IDs, labels, copy, endpoint calls, forms, and scripts will remain unchanged.

Alternative considered: rebuild every page with new components. Rejected because it introduces unnecessary behavior risk for a visual-only change.

### Translate brand geometry sparingly

Diagonal bands inspired by the stationery examples will appear only as low-density shell, header, and card accents. The logo will remain a single approved asset in expected brand positions and will not be used as a background pattern.

## Risks / Trade-offs

- [Legacy hard-coded colors can outrank theme rules] -> Use scoped selectors with controlled specificity and remove the smallest necessary set of conflicting visual utilities.
- [Brand blues can reduce status differentiation] -> Retain accessible semantic success, warning, and error colors exclusively for state communication and pair them with text or icons.
- [Remote font loading can affect performance or privacy] -> Prefer an included/local Montserrat asset if available; otherwise use a controlled font-face source with metric-compatible fallbacks and ensure the UI remains stable without it.
- [Broad CSS changes can cause unnoticed responsive regressions] -> Run Astro checks, contract tests, and Playwright coverage, then inspect representative desktop and 320-pixel mobile screenshots.
- [The existing raster logo may appear soft at large sizes] -> Keep it at navigation-scale dimensions and request an approved SVG later rather than tracing or altering the logo.

## Migration Plan

1. Add the scoped application-theme boundary and tokens without changing the landing route.
2. Restyle shared primitives and customer shell, then authentication and administration surfaces.
3. Resolve route-local conflicts and confirm every non-landing route uses the same visual hierarchy.
4. Run build, contracts, and end-to-end visual checks at desktop and mobile widths.
5. Roll back by removing the application stylesheet import and body theme class; no data migration is required.

## Open Questions

- An approved vector logo and licensed Typograph Pro webfont would improve future fidelity but are not required for this implementation.
