## MODIFIED Requirements

### Requirement: Courses must come from server-owned assignments or catalog configuration
The system SHALL show only approved courses and content assigned or available to the authenticated customer. It MUST NOT fabricate course completion, duration, rewards, or eligibility from frontend fixtures. Approved Bonda Activities courses SHALL be grouped into complete series and unlocked cumulatively by server-owned minimum level. Locked cards SHALL expose only approved preview metadata, never chapter content or provider video identifiers.

#### Scenario: No courses are assigned
- **WHEN** the customer has no approved course assignment or enabled catalog
- **THEN** Courses presents a useful empty state and contextual learning categories without reporting available course content

#### Scenario: Approved catalog is enabled
- **WHEN** the authenticated customer visits Courses
- **THEN** the page displays approved course previews and permits playback only when their current level and account state allow it

### Requirement: Separate courses and wellbeing by catalog origin
The Cursos destination SHALL show two image entry cards, Cursos and Bienestar, styled consistently with CAROBRA. Each SHALL open a separate catalog using the server-owned Bonda activity origin, not the topic category. Activity 2 route selections SHALL retain cumulative level access, including wellbeing-themed courses from Gold. Activity 1 posts SHALL be accessible in full from Bronze for active customers. Detail navigation SHALL return to the originating catalog. Existing course/chapter IDs and saved progress MUST be preserved. The gateway MUST NOT promise unintegrated live classes, automatic releases or certificates.

#### Scenario: Customer chooses Bienestar
- **WHEN** the customer opens the Bienestar card
- **THEN** only activity 1 posts appear, and every video and article is available from Bronze with current account-state authorization

#### Scenario: Customer chooses Cursos
- **WHEN** the customer opens the Cursos card
- **THEN** all approved activity 2 route selections appear, including the Bienestar topic from Gold, with unchanged level access and saved progress

#### Scenario: Customer opens a wellness article
- **WHEN** an active Bronze or higher customer opens a text post
- **THEN** the site shows a readable article without a video player, fabricated duration or video completion controls
