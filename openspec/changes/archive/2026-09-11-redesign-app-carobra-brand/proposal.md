## Why

The customer, authentication, preview, and administration interfaces currently mix Carobra blues with unrelated purple, pink, teal, and generic fintech styling, so the product does not consistently express the corporate identity. The application should translate the approved brand system into a cohesive digital experience without changing its content, business behavior, routes, or landing page.

## What Changes

- Introduce a shared digital design system derived from Carobra's approved Pantone 296C, 301C, 299C, Cool Gray 6C, logo, typography, spacing, and graphic language.
- Restyle authentication, customer, administration, and Rewards V2 preview routes while preserving their existing text, data contracts, interactions, and information hierarchy.
- Standardize shells, navigation, buttons, forms, cards, tables, statuses, focus treatments, shadows, radii, and responsive behavior through reusable CSS tokens and patterns.
- Preserve the logo's proportions, composition, approved colors, and clear presentation without effects, recoloring, distortion, pattern repetition, or content cropping.
- Keep semantic status colors available only where they communicate state, with visible text so meaning never depends on color alone.
- Exclude the public landing route (`/`) and all backend/API behavior from this redesign.

## Capabilities

### New Capabilities

- `carobra-brand-application-experience`: Defines the brand-aligned visual system and its application to non-landing product routes, including accessibility and responsive requirements.

### Modified Capabilities

None. Existing functional requirements, customer content, navigation destinations, and business behavior remain unchanged.

## Impact

- Affected code: `site-frontend/src/styles/global.css`, shared Astro layouts, and non-landing Astro pages under authentication, `cliente`, `admin`, and Rewards V2 preview routes.
- Affected assets: existing approved Carobra logo and favicon assets may be reused; no logo artwork will be modified.
- No API, persistence, backend, content, or route contract changes.
- Montserrat will be the web-safe interface typeface; Typograph Pro will not be embedded unless a licensed webfont asset is supplied.
