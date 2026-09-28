## Context

The user approved a standalone learning preview below the coupon roll: Cursos/Bienestar tabs, three compact image cards visible on desktop, translucent side arrows, mobile swiping and a signup CTA. Approved metadata lives in separate backend course and wellbeing manifests. Classification follows catalog origin, not topic; course levels are cumulative and the independent wellbeing library starts at Bronze for active accounts.

## Goals / Non-Goals

**Goals:** Attractive but restrained discovery, real preview metadata, correct level labels and accessible native navigation. Preserve all existing landing changes.

**Non-Goals:** Full public catalog, playback, provider API calls, new authorization rules, course progress, promises of certificates/points/live classes, backend/database changes, deployment or commits.

## Decisions

- Create `PublicLearningPreview` at `#aprendizaje`, immediately after `PublicCouponBrands`. Use a short heading, Cursos/Bienestar selector, one native horizontal list per space, conditional access note and `/registro` CTA. September 25 follow-up: center the heading and introductory text with the selector centered underneath at every breakpoint. Do not change the five primary navigation destinations.
- Keep a curated public metadata file with six approved courses and four approved wellness videos. Include source IDs for verification but render only safe preview fields. A contract test checks titles, origin, category, level and thumbnail against the backend manifests. Do not import the entire backend catalog into the frontend or fetch partner metadata on page load.
- Reuse existing reviewed thumbnail URLs, with lazy loading, fixed aspect ratio, no-referrer and a neutral failure placeholder. Only public preview images may load from the CDN; no provider playback IDs, scripts, iframes, credentials or customer context are introduced.
- Cards are informational, not fake playback links. Show title, compact category and minimum-level badge, without descriptions or playback controls. Courses span several levels; all wellbeing cards say Desde Bronce. The footer clarifies active-account availability and that this is a selection.
- Progressively enhance ordinary anchor selectors and two readable native lists into accessible tabs. After enhancement only one tabpanel is visible; use selected state, roving tabindex, Left/Right/Home/End tab keyboard navigation, and focusable panels. Without JavaScript both groups stay readable with anchor links and native scrolling; custom arrows remain hidden.
- Use three visible cards on desktop, two on tablet and one on small screens. Put 44px translucent arrows outside the images. No timer/autoplay; respect reduced motion, update boundaries after tab changes and resizing, and use instant Home/End navigation to cancel in-flight animations. Keep controls independent of the coupon roll.

## Risks / Trade-offs

- Preview metadata may drift from approved inventory → automated cross-manifest contract plus explicit curated updates.
- Remote thumbnails may fail or be withdrawn → stable layout and readable titles with an intentional neutral fallback; availability remains conditional. Image failure must not block the rest of the landing.
- Existing uncommitted landing changes → keep edits isolated to this new section, metadata, tests and minimal import/insertion.

## Migration Plan

Frontend-only local review. Remove the component import/insertion to roll back. No migrations or deployment. Preserve other open changes and do not sync/archive automatically.
