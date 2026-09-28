## ADDED Requirements

### Requirement: Publish only approved complete courses
The system SHALL publish a versioned allowlist of real Bonda Activities posts grouped by course, final category, ordered chapter number and minimum level. It MUST exclude review, missing, duplicate and incomplete course selections and MUST NOT automatically expose new partner content. The separately approved activity 1 Bienestar snapshot SHALL include all current videos and articles with Bronze minimum level, without including events. The API SHALL return content type and catalog space explicitly, and MUST enforce identical current-account authorization for articles and videos. Article progress endpoints MUST reject video-completion requests without writing data.

#### Scenario: A series is incomplete or ambiguous
- **WHEN** a named series cannot be mapped to all approved chapters uniquely
- **THEN** the whole series is held for review and absent from the customer catalog

### Requirement: Enforce cumulative access on the server
The system SHALL resolve the authenticated customer's current journey and grant playback only for ACTIVE customers at or above the course minimum level. Invitado SHALL receive approved previews without content or video identifiers. Titanio SHALL inherit all approved courses. Direct URL requests MUST enforce the same rules.

#### Scenario: Lower level requests a higher level chapter
- **WHEN** a Bronze customer requests a Silver course detail by URL
- **THEN** the server rejects playback without exposing provider identifiers or chapter content

#### Scenario: Titanio opens an approved Bronze series
- **WHEN** an active Titanio customer requests the course
- **THEN** all verified chapters are available in the approved order

### Requirement: Keep partner access safe and bounded
The BFF SHALL keep credentials private, validate HTTPS destinations and numeric Vimeo identifiers, reject redirects, bound timeouts/concurrency/cache size, and coalesce repeated detail requests. Course listing SHALL NOT crawl Bonda on each navigation. Invalid or unavailable upstream data SHALL produce a distinct recoverable error, never a fabricated empty catalog.

#### Scenario: Bonda fails while opening a course
- **WHEN** a required chapter cannot be retrieved or validated
- **THEN** the viewer presents temporary unavailability and no partial series playback

### Requirement: Provide a usable course viewer
The site SHALL provide category and access filters, image cards, minimum-level previews and a responsive course viewer with complete ordered chapters, descriptions, supplied duration and safe embedded playback. It MUST NOT invent progress, points or certificates.

#### Scenario: Customer selects a chapter
- **WHEN** an eligible customer selects an ordered chapter
- **THEN** its description and video replace the prior chapter without loading multiple players
