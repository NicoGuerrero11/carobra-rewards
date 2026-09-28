## Context

The landing has a standalone prospective catalog section introduced by `simplify-landing-products-catalog`. The next user-approved iteration replaces its plain future gift-card names with a coupon-brand roll. Approved coupon mappings are recorded in backend migrations 024 and 025; they are evidence of inclusion, not a promise of live redemption or universal eligibility.

## Goals / Non-Goals

**Goals:** Compact official lettering, generous whitespace, translucent side arrows, touch/keyboard browsing and truthful preview copy. Keep the catalog anchor and separate section.

**Non-Goals:** Course previews, automatic coupon issuance, live provider calls, exposed credentials, backend/production changes, invented discounts, restyled third-party lettering or new dependencies.

## Decisions

- Select brands from existing approved coupon mappings, deduplicate repeated offers by brand and record their coupon references with the official asset source. Obtain wordmark-oriented artwork from each brand's own website/CDN. Preserve original marks; retain any inseparable logo details rather than reconstructing fonts or using AI. Store small assets locally for reliability and inspect SVGs for active/external content.
- Replace the old prospective brand tiles entirely with a dedicated `PublicCouponBrands` component at `#catalogo`. Use compact heading, one short introductory line and an explicit level/terms disclaimer. Do not label approved coupon previews as future gift cards or claim immediate redemption.
- Use a single native horizontally scrollable list with scroll snapping, not a carousel dependency or duplicated infinite marquee. Show translucent round arrow buttons in side gutters, outside the readable artwork area. Move by a viewport-sized group, clamp at each end and reflect disabled states. Keyboard supports ArrowLeft/ArrowRight/Home/End on the focusable viewport; touch uses native scrolling.
- No automatic motion: the user can inspect each wordmark without a timer or extra pause button. Smooth movement is user-triggered and disabled for reduced-motion preferences. Home/End jump immediately to their boundary and cancel any in-flight arrow animation. Resize updates button availability. No-JS leaves the native scrollable list usable, with inert custom controls hidden.
- Benavides' sourced white/red lockup is presented through a CSS viewport showing only its lettering (source x=38..150), excluding the separate emblem as requested. This avoids flattening its two-color emblem into an unreadable block during monochrome presentation. The source SVG remains intact and the letters are not clipped or distorted.
- Use responsive cell widths rather than large bordered cards. Ensure meaningful image names and a readable plain-name fallback on load failure; the brand list is informational, not a misleading redemption link. Maintain existing signup/signin navigation.

## Risks / Trade-offs

- Publicly hosted artwork is not proof of a publication license → document sources for local review and keep publication approval separate; do not claim that permission was independently verified.
- Provider catalog can evolve → preview is a curated subset with conditions, no numeric discount promises, and no synchronous network dependency.
- Prior open delta modifies the same catalog requirement → when syncing later, apply `simplify-landing-products-catalog` before this change; preserve its product requirement and the separate video delta. Do not silently revise historical intent.
- Logos differ in aspect ratio → inspect optical sizing on desktop/mobile without cropping or distortion. Research found several white-only variants: preserve original file bytes and apply a neutral dark monochrome CSS presentation to Cinépolis, Benavides, Harmon Hall and Sonora Prime for contrast. Document that this is a presentation adaptation, not an independently verified official dark variant; other source colors remain unchanged.

## Migration Plan

Frontend-only, local review first. No data migration or deployment in this task. Rollback only this component, assets and catalog replacement.
