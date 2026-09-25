## Context

Inicio consumes the V2 portal, whose legacy learning assignments do not represent the Activities catalog. Current authenticated coupon and course APIs already own eligibility. Course progress stores chapter-level watched ranges and manual/automatic completion; there is no separate enrollment or resume-position record.

## Goals / Non-Goals

**Goals:** Compact brand-consistent discovery, real available benefits, chapter-aware continuation, distinct wellness, product interest, truthful level guidance and resilient loading.

**Non-Goals:** New reward rules, actual point crediting, assignments, exact-second resume, video playback on Inicio, contact-routing changes, new dependencies, migrations, deployment or gift-card activation.

## Decisions

- Keep SSR and the existing auth middleware. Read coupons (four previews) and the reviewed course catalog concurrently with bounded timeouts; reuse the middleware portal. Independent API authorization remains authoritative when the portal is unavailable. Set private/no-store on personalized HTML; never share customer progress caches.
- Coupon preview uses an explicit read-only query mode and the already configured technical catalog affiliate. Unlike normal benefits visits it never invokes customer affiliate provisioning. Without that technical identity it fails closed to a catalog link, preserving the normal benefits flow. Existing bounded catalog caching remains in use.
- Extend the authenticated course-list summary with started, last activity and resume chapter number derived from the same customer's saved rows. Ignore obsolete chapters and zero-play heartbeats. Prefer the last unfinished chapter, otherwise the first incomplete chapter. Exclude completed and inaccessible courses from continuation. No progress writes and no partner detail calls.
- Select up to two unfinished courses by recency, then fill discovery slots with accessible courses. Wellness separately selects one video and one article from activity 1. These are catalog selections, not claimed personalized recommendations. No exact-second playback claim.
- Extract coupon markup/styles into a reusable card used by catalog and home. Preserve photo, overlapping logo, image/text separation, discount, summary, channels and accessible name; avoid new per-card detail requests.
- New Inicio CSS uses its own namespace to avoid old global home overrides. Preserve Montserrat and Carobra tokens: only level treatment has a branded gradient, gold represents points and (as requested in the level-identity refinement) the explicitly labeled Oro level; primary controls remain navy/blue. Level accents stay local: copper Bronce, cool silver Plata, warm gold Oro, pale platinum-green Platino and steel-blue Titanio. Use the same accent for the current title/emblem and each corresponding level chip, with a check and outlined chip identifying the current level independently of color. Avoid giant heroes, fixed-height copy and horizontal overflow.
- Keep real balance and approved expiration; show next-level remaining requirements only with rule_available and a valid higher target. No fabricated percentages. Titanio celebrates current access. Invited gets product discovery; blocked/inactive gets account/help guidance rather than active access claims.
- Product teasers reuse approved presentation assets and 600/150/600 display values, link to matching Productos anchors, and do not change contact destinations or imply crediting. Recent activity is limited to three entries. Retain only actionable safe internal pending portal actions; no generic filler or future gift-card promotion.

## Risks / Trade-offs

- Independent API calls still incur auth/database latency → parallel, bounded, no detail/media preloads or catalog crawl; module-specific failure messaging instead of all-or-nothing rendering.
- Course progress unavailable → show eligible discovery with an honest small notice, never erase or reset stored progress.
- Partner inventory can change → use existing approved catalog eligibility; detail rechecks availability as before.
- More modules can lengthen home → bounded 4 benefit cards, 2 course cards, 2 wellness items, 3 product teasers and 3 activity entries.

## Migration Plan

No data migration. Build backend and frontend and restart the local BFF for added read-only progress metadata. Rollback page/components and optional list metadata without altering customers or progress. Deployment remains separate.
