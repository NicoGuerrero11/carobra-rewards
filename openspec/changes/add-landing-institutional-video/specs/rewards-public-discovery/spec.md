## MODIFIED Requirements

### Requirement: Public hero supports an institutional video without fabricating one
The public hero SHALL display the approved institutional YouTube video `BZD93x4dmt4` as a standalone responsive cover with a small accessible translucent play action. It MUST NOT wrap the video in a card or add a title or explanatory text beneath it. It MUST preserve the primary hero copy and registration actions, remove the pending-video notice and MUST NOT claim an unverified duration. The embedded player SHALL load only after explicit interaction, without playback on page load, and SHALL preserve its allocated layout space.

#### Scenario: Visitor opens the landing
- **WHEN** a visitor opens the public landing
- **THEN** only the approved video cover and translucent play action appear in the institutional area, with no YouTube player iframe or player SDK loaded yet
- **AND** the hero retains its existing copy, registration link and how-it-works link

#### Scenario: Visitor plays the video
- **WHEN** a visitor activates the play control with pointer or keyboard
- **THEN** exactly one privacy-enhanced YouTube player opens inline for the approved video with controls and fullscreen available
- **AND** focus moves to the player without moving the surrounding layout

#### Scenario: Preview framing is polished
- **WHEN** the institutional video cover is visible
- **THEN** a small preview-only crop removes its embedded black side bars, and a soft shadow visually separates the video from the background without adding a card or caption
- **AND** after activation the embedded player and its controls remain unscaled and uncropped

#### Scenario: Narrow mobile viewport
- **WHEN** the landing is viewed at 320px width
- **THEN** the video appears below the hero copy without horizontal overflow and its player remains at least 200px high

#### Scenario: JavaScript is unavailable
- **WHEN** JavaScript is disabled
- **THEN** the cover exposes a direct link to the approved video on YouTube

#### Scenario: Thumbnail is unavailable
- **WHEN** the high-resolution cover cannot load
- **THEN** the standard thumbnail is attempted, and if it also fails the branded background and accessible play control remain without a broken-image placeholder
