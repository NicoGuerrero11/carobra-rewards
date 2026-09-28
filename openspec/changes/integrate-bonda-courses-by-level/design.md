## Context

The final route contains named courses, complete series, category relocations and explicit editorial holds. Bonda Activities supplies individual posts, not course/module entities. The existing Courses page is a placeholder. Authentication and the current Rewards journey remain authoritative.

## Goals / Non-Goals

Goals: approved cumulative catalog, six-profile access, ordered complete series, safe in-site playback, fast card navigation, maintainable source mapping and pending-content audit.

Non-goals: enrollment, coupon issuance, rewards for playback, progress/completion claims, certificates, publishing editorial holds, automatically admitting new partner posts, production changes.

## Decisions

- Version a curated manifest with exact numeric activity/post IDs, original titles, chapter order, final category, minimum level and slide reference. Numeric course ID is the first approved post ID. Do not use fuzzy matching at runtime. Keep unmatched/ambiguous/extra-chapter series in a review report, not the customer catalog.
- Preserve the specific relocation rule over the earlier general listing (e.g. Impactar y Comunicar belongs to Oratoria/Titanio). English presentation supplements stay in Inglés/Platino and are inherited by Titanio, not duplicated. Programming awaits selection as the document explicitly states. Titanio means all approved content, not every partner post.
- Catalog cards use reviewed API metadata in the manifest, avoiding a full upstream crawl on navigation. Detail fetches only that course's chapters with bounded concurrency and a short, deduplicated memory cache. Upstream errors are unavailable states, not empty approvals. No stale media fallback.
- Resolve current level/state server-side for every request. INVITED can see card previews only. Only ACTIVE and adequate level can fetch chapter content and Vimeo IDs. BLOCKED/INACTIVE cannot play. No payload or video IDs in the list response. Credentials remain server-side; redirects disabled; HTTPS hosts allowlisted; foreign HTML rendered as text.
- UI uses existing CAROBRA shell, compact image cards, filters, readable course outline, and one player at a time. No progress writes or fake completion actions.

## Risks / Trade-offs

### Learning gateway (approved September 23)

Keep the primary Cursos navigation and two CAROBRA image entry cards. The whitelisted `tipo=cursos|bienestar` query selects a server-rendered catalog. September 24 correction: classify the space by Bonda activity origin, not topic. All route-defined courses belong to activity 2/Cursos, including the 11 published Gold wellbeing courses. Their numeric IDs, chapters, eligibility and progress remain unchanged. Activity 1/Bienestar is an independent catalog available in full to active Bronze and higher customers; Invitado remains preview-only, and blocked/inactive accounts cannot access details.

Import a reviewed snapshot of all current activity 1 posts (70 videos and 46 articles), not events or live classes. Keep preview metadata only in the manifest and check current content/type/title at detail access. Articles have no player, video duration, video completion controls or progress writes. Videos reuse the existing 80% coverage/manual completion behavior. Resolve the space server-side and return it explicitly to the frontend; category labels cannot grant access or decide navigation. Preserve bounded caching and avoid partner crawls during page navigation. Snapshot refreshes are explicit reviewed operations.

- Bonda may withdraw content after the catalog metadata snapshot: detail verifies all chapters before providing playback and fails safely; synchronize metadata as an explicit reviewed operation.
- Some titles in the deck abbreviate real titles: approve only uniquely verified equivalents; ambiguous titles and series stay pending with candidates.
- Vimeo may restrict embedding by domain: show a clear player-help note and verify the embed URL response; actual domain access still depends on Bonda/Vimeo settings.
- Shared configured affiliate is used for read-only content, consistently with the existing partner catalog integration; customer level authorization stays in CAROBRA.

## Migration Plan

No database migration. Build and enable BONDA_COURSES_ENABLED with existing partner credentials and configured catalog affiliate. Default disabled; rollback the flag. Do not change coupons flags. Deploy only after separate approval.

## Open Questions

September 23 follow-up: remove the text search field from Cursos and Bienestar at the user's request. Keep category and access selectors in two columns on desktop and one column on mobile. Initialize filtering independently of the removed input; preserve pagination and empty states.

Editorial holds, duplicate variants, extra/mislabeled chapters and the Programming inventory need team approval. The initial catalog deliberately excludes them.
