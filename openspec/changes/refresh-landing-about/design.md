## Context

The user approved the institutional refresh and explicitly confirmed 15 years on 2026-09-25. The current landing repeats a large title and blue fact cards; neighboring sections now use compact Montserrat headings and Carobra colors.

## Goals / Non-Goals

**Goals:** Compact, credible institutional block, 15 years, prominent facts, one official-site link, responsive reflow and preserved anchor.

**Non-Goals:** Registration CTA, new claims, stock photos, duplicate logo, scripts, animations, dependencies, backend/database changes or redesigning adjacent sections.

## Decisions

1. Extract `PublicAbout.astro` with scoped styles and delete the replaced about-only global rules. This isolates typography instead of layering overrides onto the old large-title styles.
2. Use a centered heading (1.5–2rem), short approved introduction and a semantic definition list. Show three equal desktop columns: `15` / años de experiencia, `Más de 2,000` / asesores, and `Alianzas` / con instituciones líderes. Small labels retain Trayectoria, Red nacional and Respaldo. Subtle vertical separators replace card backgrounds; switch to stacked rows and horizontal separators at 700px.
3. Keep a near-white blue-tinted background and Carobra navy/blue text for contrast. Do not add icons or a second logo: the typography and facts provide the emphasis.
4. Preserve `#quienes-somos`, add an anchor offset and accessible heading association, and keep one 44px-minimum keyboard-focusable link to the existing HTTPS official site. Open externally with `noopener noreferrer` and disclose the new tab to assistive technology.
5. Keep existing advisor/alliance facts without adding client counts, awards or guarantees. The age correction comes from the user's explicit confirmation; record source context during verification.

## Risks / Trade-offs

- Long metric and enlarged text could overflow → fluid type, minmax columns, wrapping, mobile and 200% text tests.
- Sticky header could cover the anchor → preserve the section id and verify heading visibility after keyboard navigation.
- Removing global CSS could affect another use → confirm selectors are confined to the replaced section.
