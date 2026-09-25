## Context

The user approved the proposed closing content and design after the other landing sections were refreshed. The old `#confianza` block is full-width blue but oversized; its operational language distracts from registration.

## Goals / Non-Goals

**Goals:** Compact centered closing block, subtle corporate-blue gradient, approved concise copy, white registration button and text-only sign-in link.

**Non-Goals:** Footer redesign, new guarantees, changes to account eligibility, authentication, business logic, other navigation destinations, media, animation or added JavaScript.

## Decisions

1. Extract a static `PublicClosingCta.astro` with scoped selectors. Remove the superseded `.trust` rules, including mobile overrides, rather than layering overrides on the oversized legacy CSS. Leave general button utilities and footer styles unchanged.
2. Use `Tu siguiente paso empieza aquí.` as a 1.5–2rem heading and the exact approved introduction: `Descubre los beneficios, cursos y bienestar disponibles para tu nivel en Carobra Rewards.` Keep the existing `#confianza` anchor for navigation compatibility.
3. Use a dark blue base with a subtle blue gradient, white heading and light supporting text. Center content with restrained padding. Display a content-width white `Únete a Rewards` button leading to `/registro`, then `¿Ya tienes cuenta?` plus an underlined `Inicia sesión` link to `/login`. Do not use a second filled/outlined button.
4. Use native anchors with visible high-contrast keyboard focus, at least 44px target heights and flexible wrapping. No client scripts or data fetching; small-screen and enlarged text layouts must remain unclipped.

## Risks / Trade-offs

- Shared legacy styling could leak into the CTA → unique scoped styles and removal limited to section-only rules.
- Sticky header could cover the heading → scroll-margin offset and anchor navigation test.
- White focus on the white CTA may disappear → use white outline with a dark-background gap and test focus state and contrast.
- Footer may constrain anchor scrolling near the document end → verify heading visibility, not an exact scroll position.
