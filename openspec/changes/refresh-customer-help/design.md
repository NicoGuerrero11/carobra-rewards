## Context

The authenticated Ayuda route receives the customer portal from middleware. Its current two FAQs and repeated mailto links do not cover the expanded site. Existing Activity and Notifications use compact typography and Carobra design tokens. The approved support address is only an example, not an operational channel.

## Goals / Non-Goals

**Goals:** Provide 15 concise FAQs in five topics, quick troubleshooting navigation, internal actions, truthful account-specific guidance, and responsive keyboard-accessible presentation. Preserve generic help if the portal projection fails.

**Non-Goals:** New business rules, provider API requests, real support messages, search, tickets, live chat, password recovery, points awards, certificates, or changing authentication and other pages.

## Decisions

- Render general FAQ content as local semantic Astro markup with native details/summary. Unlike fetching a help catalog, this keeps static answers available without another network dependency and safely escapes account text.
- Use real anchor links for topic and troubleshooting navigation, not tabs that hide answers. A small progressive enhancement opens a question targeted by its URL fragment; all content remains operable without JavaScript.
- Keep server-provided contextual help separate from general instructions, with a clear unavailable notice when that projection is missing. Reuse middleware context; bound the legacy fallback request.
- Reuse current design tokens and existing navigation icons with an isolated `customer-help` CSS namespace. Avoid legacy portal hero rules and new dependencies.
- Present the example email as plain text with a visible non-operational label. Product inquiries route to Productos; no support mailto, fake submit button, hours, or response-time promises.
- Explain recorded progress, manual completion, and chapter completion without exposing playback thresholds or promising points/certificates. Retain per-benefit conditions rather than generalizing redemption terms.

## Risks / Trade-offs

- Static FAQ content could drift → keep answers grounded in current feature behavior and verify key rules/routes in browser tests.
- Authentication outage can still prevent private-page access → resilience covers an unavailable portal projection for an authenticated customer, not an authentication bypass.
- The official contact channel remains undecided → visibly label `soporte@carobra.com` as an example and do not make it actionable.
- A long FAQ list could overwhelm mobile users → closed native accordions, five shortcuts, short answers and no oversized hero.

## Migration Plan

No migration or environment changes. Apply only frontend content/styles and isolated tests. Revert these files to roll back; do not touch other in-progress work.

## Open Questions

The team must confirm the real support channel, service hours, and any point-crediting timeframes before publication. These do not block the approved example UI.
