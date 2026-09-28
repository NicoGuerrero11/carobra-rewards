## Context

Approved numeric course/chapter IDs and server-owned level checks already exist. Vimeo runs in an embedded iframe without tracking. PostgreSQL is shared with production; schema activation needs explicit permission. Admin pages currently redirect away and have no enabled staff authentication.

## Goals / Non-Goals

Goals: durable per-customer chapter coverage, manual/automatic completion provenance, course summaries, useful operator reporting and honest failure states.

Non-goals: proof of attention or learning, certificates, points, level changes, staff authentication implementation, automatic video playback or collection of device/location data.

## Decisions

- Present a separated neutral footer below the selected chapter description: “Sin completar” and an outlined “Marcar como completado” action, replaced by “✓ Completado” after either confirmed completion method. Hide playback percentages, provenance and automatic-threshold explanations from customer UI, including after reload; preserve actual coverage and separate timestamps internally. Keep retryable error feedback. Background saves leave the action enabled; only a pending manual mark disables it. Threshold and terminal playback updates queued during an in-flight request are drained immediately after that request succeeds, including the final continuous sample.
- Add a dedicated PostgreSQL progress table keyed by customer/course/chapter, referencing customers. Store merged distinct playback intervals, canonical duration, first manual completion and first playback completion timestamps. Row locks make overlapping browser updates idempotent and prevent lost coverage. Replays do not undo completion.
- Retain both completion timestamps; completing manually does not inflate coverage. Automatic completion requires at least 80% union coverage against a server-resolved provider duration. Invalid ranges, durations and foreign chapters are rejected. Browser telemetry remains self-reported and is not fraud-proof.
- Use the official Vimeo SDK. Accumulate continuous forward playback intervals, discard seeks, pauses, buffering and discontinuities, respect playback speed and never infer coverage from furthest position or an ended event. Save in batches every 15 seconds plus pause/chapter switch/page hide/manual action/threshold. Save failures retain pending updates and show retry guidance. Completion UI updates only after server confirmation.
- Derive identity from the authenticated session and recheck current level on reads/writes of chapter progress. Require JSON and a custom request header; the same-origin frontend proxy rejects cross-origin writes. No customer ID accepted in the body.
- Course completion is all approved chapters marked. Catalog and detail tolerate progress storage failure without hiding content or pretending the save succeeded. Keep existing partner caching.
- Provide bounded paginated CSV export through a database-credentialed CLI, not a public endpoint or unauthenticated admin page. Include customer ID, course/video names, coverage and manual/playback dates. Do not export emails by default.

## Risks / Trade-offs

- Forged browser events cannot establish real attention; label as recorded playback and never use alone for rewards.
- Process exit/offline can lose the latest unsaved interval; show failure/retry and flush best effort, persist acknowledged progress only.
- Provider replacement behind the same approved ID requires editorial review of historical progress; no automatic remapping.
- A missing migration disables progress gracefully, never the catalog.

## Migration Plan

Create additive migration 026, test against an isolated database, and apply only that migration to production after owner approval and a read-only preflight. Do not run unrelated pending migrations. Rollback runtime first; retain progress table to avoid deleting customer history.

## Open Questions

Owner authorization received for only the additive progress table migration, after tests. Staff UI remains a future feature; the initial administrative query is a CLI export.
