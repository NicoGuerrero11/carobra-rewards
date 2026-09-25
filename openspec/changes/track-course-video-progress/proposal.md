## Why

Customers need a durable record of videos they have watched and the team needs to distinguish self-reported completion from browser-detected playback. The current read-only catalog provides neither.

## What Changes

- Add manual “Marcar como completado” and automatic completion at 80% distinct playback coverage for each approved chapter.
- Persist customer-specific progress across sessions and display course completion from all its chapters.
- Keep manual and playback completion timestamps separately for reporting. Do not claim attention, learning, certification, or grant rewards.
- Add an operator-only paginated report/export command. The admin website has no enabled authentication and remains closed.
- Preserve level authorization and handle storage failure without falsely confirming a save.

## Capabilities

### New Capabilities

- `course-video-progress`: Authorized durable video progress, completion provenance, course summaries and protected reporting.

### Modified Capabilities

None. This explicitly adds real progress recording to the existing read-only course experience.

## Impact

BFF course application, PostgreSQL additive migration, frontend Vimeo Player SDK and progress controls, automated tests, operator documentation. Applying the production migration requires separate owner authorization. No production deployment or changes to levels, customers, benefits or points.
