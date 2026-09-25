## Context

The user approved a centered, compact three-step sequence in place of the legacy split timeline at `#experiencia`. The refreshed neighboring components already establish Montserrat, Carobra navy/blue, compact headings and generous but restrained spacing.

## Goals / Non-Goals

**Goals:** White background, centered heading, three blue numbered circles connected by a subtle line, concise approved copy, horizontal desktop layout and vertical mobile reflow. Preserve the menu and hero anchor destinations.

**Non-Goals:** Additional CTA, cards, quotes, animations, scripts, remote assets, changes to registration/product validation/eligibility, or changes to adjacent sections.

## Decisions

1. Extract `PublicHowItWorks.astro` with scoped styles; remove the old timeline data and markup from `index.astro`. Unique selectors avoid inheritance from large legacy timeline styles without altering global CSS used elsewhere.
2. Use a semantic ordered list with visible 01/02/03 circles. Hide decorative number copies from assistive technology; retain the ordered list semantics. Connectors are CSS decoration, not a progress bar or completion indicator.
3. Show equal desktop columns with aligned content and switch to vertical steps at 700px. The mobile connector follows the list length so it does not require fixed card heights. Match the preceding section's 1.5–2rem title scale and maintain readable text contrast.
4. Use the exact approved step meanings: create an account, confirm products to determine the level, then discover the points and content available to that account. Do not imply instant validation or universal entitlement.
5. Keep `#experiencia` and add an anchor offset for the sticky header. No JavaScript is necessary; content works with scripts disabled and reduced motion.

## Risks / Trade-offs

- Longer third heading could unevenly align the text → reserve a consistent heading row on desktop and remove that constraint on mobile.
- Fixed header could obscure anchor navigation → test both menu and hero links against the visible heading.
- Enlarged text could strain the layout → test narrow viewport with 200% root text sizing and check overflow.
