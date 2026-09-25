## Context

The page currently mixes administrative state, advisor banners and a three-item commercial offer. It uses temporary letters as brand identifiers and hardcoded reward claims. Existing product states come from the authenticated portal API.

## Goals / Non-Goals

**Goals:** Prioritize desire and contact, with distinctive brand areas, brief aspirational copy and compact customer information. Detailed sales conversations happen with the advisor, not in instructional dialogs.

**Non-Goals:** Lead capture, online contracting, reward calculations, changes to customers or product activation, deployment, or claiming marketing/legal approval.

## Decisions

- Three compact vertical cards in a single desktop row replace the oversized horizontal panels. Use two columns on tablets and one on phones, with a shallow branded header and readable commercial copy. Keep the newly approved copy and direct-contact behavior; only the presentation density changes.
- Prominent official-source logos stay in proportionate brand color areas; Modalidad 40 uses a typographic service identifier, not an insurer or IMSS logo. Keep brand accents isolated from semantic status colors and navy Carobra actions. No fixed card heights or text truncation; align contact actions at the bottom of equal-height desktop cards.
- Remove the first iteration's native dialogs. Each goal-specific contact action goes directly to the existing advisor email with the product identified: Quiero empezar a ahorrar (Skandia), Quiero proteger mi auto (Quálitas), Quiero planear mi retiro (Modalidad 40). A small correo label clarifies the destination without adding another instructional section. Buttons fill the card body width to fit these labels without changing the compact grid.
- Replace the generic closing copy with Hablemos de lo que quieres lograr / Da el siguiente paso con el equipo Carobra / Contactar a un asesor. No fictional advisor identity or photo. WhatsApp, callbacks, lead capture and contact-routing changes remain deferred for the team's decision; email addresses and subjects stay unchanged.
- Present catalog even when linked-product data is temporarily unavailable, while retaining authentication. Show a clear unavailable state only in the account area.
- Reuse product-context mailto links; explicitly label the email behavior rather than simulate a saved request. No form or API writes.
- No generic Rewards promotion, explore-benefits CTA, or unapproved points/level claims. Real linked-product status and level-impact strings remain unmodified inside account details.
- The owner confirmed display amounts of 600 for Skandia, 150 for Quálitas and 600 for Modalidad 40 in this conversation. Add a small blue +N puntos Rewards label immediately above each CTA. Keep these frontend presentation values separate from backend rules; do not grant points or change balances, levels, eligibility, award flags or the points master. Do not invent crediting timing or conditions.

## Risks / Trade-offs

- Brand assets and introductory copy need team approval before publication → document provenance and keep this as a local review iteration.
- Amounts are approved for display, but crediting conditions and production reward enablement remain pending → no automatic-award/timing claims; resolve operational conditions before publication. Do not invent eligibility, pricing or projected levels.
- Email requires a configured client → explain that the action opens email; no false submission confirmation.

## Migration Plan

Frontend-only change; no database migration. Roll back the page, data and CSS files if needed without touching existing course work.
