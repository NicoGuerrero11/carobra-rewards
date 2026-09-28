## Why

The landing's institutional block still displays a placeholder. The user has approved YouTube video `BZD93x4dmt4` to replace it while preserving the hero copy, calls to action and Carobra visual identity.

## What Changes

- Replace the large introduction card with the approved video's cover and inline click-to-play player.
- Following the user's visual review, display only the video with a small translucent play control; remove the surrounding card, caption and pending-video notice.
- Defer the embedded player until interaction; support mobile layout, keyboard activation and a no-JavaScript YouTube link.
- Replace the previous optional file-URL configuration with the explicitly approved YouTube video; do not claim an unverified duration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rewards-public-discovery`: The public hero displays the approved institutional YouTube video with an accessible, deferred player and fallback.

## Impact

Landing page, a dedicated video component, obsolete public hero-media styles and landing browser tests. No backend, account data, new runtime dependency or production configuration changes.
