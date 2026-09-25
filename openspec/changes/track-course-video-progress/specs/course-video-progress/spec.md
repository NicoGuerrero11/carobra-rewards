## ADDED Requirements

### Requirement: Preserve authorized durable video progress
The system SHALL persist progress per authenticated customer and approved course chapter. It MUST reject unauthenticated, inactive, blocked, insufficient-level and foreign-chapter writes, MUST NOT accept customer identity supplied by the client, validate bounded input and protect browser mutations from cross-origin requests.

#### Scenario: Another customer opens the same course
- **WHEN** a different authenticated customer reads progress
- **THEN** the first customer's coverage and completion are not returned

#### Scenario: Access is revoked
- **WHEN** a customer without current playback permission tries to mark a chapter
- **THEN** the write is denied even if the media or prior progress is cached

### Requirement: Distinguish manual and detected completion
Customers SHALL be able to mark an eligible video manually. The system SHALL also mark completion when at least 80% of distinct recorded playback coverage is reached. It MUST retain manual and playback timestamps independently and MUST NOT convert a manual mark into 100% playback.

#### Scenario: Customer seeks to the end
- **WHEN** the player jumps to its final seconds without reproducing 80% of the content
- **THEN** no automatic completion is recorded

#### Scenario: Coverage spans sessions and repeated segments
- **WHEN** overlapping playback intervals arrive from multiple sessions
- **THEN** their union is saved without double counting or losing updates, and completion survives reload

### Requirement: Display honest chapter and course status
The viewer SHALL show confirmed chapter completion and aggregate completed chapters out of the approved course total. A course SHALL be completed only when all its chapters are marked. Failures SHALL expose retryable feedback, not false success, while leaving playback usable.

#### Scenario: Database save fails
- **WHEN** a manual or automatic progress save fails
- **THEN** the UI retains pending data, reports that saving failed and does not claim completion was saved

#### Scenario: Unified customer-facing completion
- **WHEN** manual or playback completion has been confirmed, including after reload or chapter navigation
- **THEN** the viewer shows the same “✓ Completado” state, hides the completion action, and does not display a playback percentage, completion provenance or automatic-threshold explanation
- **AND** stored playback coverage and manual/playback timestamps remain distinct and unchanged by this presentation

#### Scenario: Completion arrives during an in-flight save
- **WHEN** playback reaches the completion threshold or stops while an earlier progress request is pending
- **THEN** the latest coverage is saved after that request finishes without requiring more playback or another timer tick
- **AND** background saving does not disable the manual completion action or mimic a completed state

### Requirement: Place the completion control after the description
The viewer SHALL place the completion status and action in a visually separated footer below the selected chapter description, preserving the same position across chapter changes.

#### Scenario: Customer reads the chapter description
- **WHEN** the customer reaches the end of the selected chapter description
- **THEN** the completion action appears in its own separated area

### Requirement: Provide protected operator reporting
An operator with database credentials SHALL be able to query/export bounded pages of progress by customer or course, including coverage and separate completion timestamps. The report MUST NOT be accessible to ordinary customers or through an unauthenticated staff page, and MUST NOT imply verified attention, learning, points or certificates.

#### Scenario: Operator exports a course page
- **WHEN** an authorized operator runs the report command with a course filter and pagination
- **THEN** it returns the matching progress rows with provenance and no credentials or video access URLs
