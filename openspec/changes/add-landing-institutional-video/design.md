## Context

The hero currently uses an optional file URL or an oversized institutional placeholder. The user approved YouTube video `BZD93x4dmt4`. YouTube oEmbed identifies it as “Video Corporativo Carobra 2026 ✨” by CAROBRA; its high-resolution thumbnail returns HTTP 200. Public and authenticated styles are separate.

## Goals / Non-Goals

**Goals:** Display a responsive, standalone video preview with inline playback after user interaction and keyboard controls. Following the user's visual review, remove the enclosing card and all caption/explanatory copy, and use a small translucent play control in the lower-left corner. Preserve the hero copy, registration links and all other sections.

**Non-Goals:** Downloading or self-hosting the video, redesigning other landing sections, modifying accounts, tracking viewing progress or hiding YouTube's own branding/controls.

## Decisions

- A dedicated Astro component owns the approved video ID and scoped styles. Remove the unused file-URL branch and its obsolete global media rules; unrelated public styles stay unchanged.
- Render a remote high-resolution YouTube thumbnail with fixed dimensions and a real Play button enabled by JavaScript. On activation, replace the preview with one `youtube-nocookie.com` iframe. An eager iframe would add third-party player requests to initial loading. No player SDK is needed.
- The iframe uses `strict-origin-when-cross-origin` referrer policy, fullscreen, inline mobile playback and autoplay only after activation. Keep a no-JavaScript link over the cover; after activation, use the native player controls without additional overlays or caption links.
- Use 16:9 with at least 200px player height at narrow widths, preserve layout dimensions during activation, and move keyboard focus into the player. If the thumbnail fails, try the standard oEmbed thumbnail, then retain the branded background and controls.
- Do not add text beneath the video or state an unverified video duration. Player branding, ads, availability and final playback quality are controlled by YouTube.
- Visual polish requested after review: slightly enlarge only the cover image within its clipped viewport to remove black side bars baked into the thumbnail. Add a soft navy shadow and subtle light edge directly to the video viewport. Never scale, crop or overlay the actual YouTube iframe; any bars supplied during playback remain under YouTube's control.

## Risks / Trade-offs

- Privacy/ad blockers or uploader restrictions may block playback → separately check actual playback when possible; the native player supplies its own YouTube links. Without JavaScript, the cover's link opens YouTube directly.
- The thumbnail is a third-party request before activation → defer only the heavy player, without claiming zero external requests or cookie-free operation.
- Mobile player needs a minimum height → permit letterboxing at very narrow widths rather than cropping the video.

## Migration Plan

Deploy normal frontend assets. No database or production environment changes. Roll back the component and hero replacement if needed.

## Open Questions

None blocking; real playback verification may be limited by the browser/network environment and must not be conflated with isolated embed tests.
