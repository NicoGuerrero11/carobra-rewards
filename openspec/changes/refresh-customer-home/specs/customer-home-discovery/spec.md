## ADDED Requirements

### Requirement: Home must feature eligible current content
Inicio SHALL display at most four eligible coupon cards with catalog imagery and logos, two course previews and a wellness video and article when available. Courses and wellness SHALL retain provider-origin separation and server-owned access. Inicio MUST NOT fetch chapter content or emit player embeds, coupon codes or progress writes.

#### Scenario: Active member discovers content
- **WHEN** the authenticated APIs return eligible content
- **THEN** the member sees working detail links and catalog links without higher-level locked content presented as available

#### Scenario: Guest or restricted account visits
- **WHEN** APIs deny access or return no eligible content
- **THEN** Inicio displays truthful discovery or account guidance without playable items or redemption actions

### Requirement: Learning continuation must use saved customer progress
Course previews SHALL report started state, last activity and a resume chapter derived only from valid saved chapters for that customer. Inicio SHALL prioritize recent started incomplete accessible courses and link to the pending chapter. Manual completion MUST count visually as completion without manufacturing watched time. Articles SHALL have no video progress.

#### Scenario: Customer returns to an unfinished course
- **WHEN** a customer has saved partial playback or some completed chapters
- **THEN** Inicio shows Continuar curso, the saved completed chapter count and a link to an unfinished chapter

#### Scenario: Course has been completed
- **WHEN** all chapters are manually or automatically completed
- **THEN** the course is not labeled as an unfinished continuation and no playback percentage is invented

#### Scenario: Progress storage fails
- **WHEN** catalog metadata is available but progress cannot be read
- **THEN** eligible content remains discoverable and Inicio explicitly reports that saved progress could not be retrieved

### Requirement: Home must remain compact and resilient
Inicio SHALL use approved brand tokens, local level accents, readable responsive cards and semantic headings. Account, coupons and learning failures SHALL affect only their modules. Data reads SHALL be bounded and concurrent; personalized output SHALL not be publicly cached.

#### Scenario: One module fails
- **WHEN** the portal or one catalog returns an error or times out after authentication
- **THEN** unaffected content, product discovery and navigation remain available and failed sections show truthful notices

#### Scenario: Narrow viewport
- **WHEN** Inicio is viewed at 320 pixels or wider
- **THEN** cards, focusable actions and text reflow without horizontal overflow or overlapping imagery

#### Scenario: Customer identifies membership levels
- **WHEN** an active member views the account summary
- **THEN** each of the five level labels has a distinct readable local accent, the current title and emblem share its accent, and the current chip also uses a check, border and accessible current-step state rather than color alone

### Requirement: Commercial and account summaries must remain truthful
Inicio SHALL show concise product teasers with the approved 600/150/600 presentation values and existing product destinations, plus up to three recent real account events. It MUST NOT activate products, credit points, invent advisor identities or suggest watching content grants rewards.

#### Scenario: Customer opens a product teaser
- **WHEN** the customer selects a product on Inicio
- **THEN** the matching product section opens without submitting a request or altering account data
