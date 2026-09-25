## Why

The team has supplied the final September 2026 course route. The private Courses page can now replace its placeholder with approved Bonda Activities content, grouped into complete series and unlocked cumulatively by customer level.

## What Changes

- Curate an auditable mapping of the final presentation to actual Bonda post IDs, categories, chapter order and minimum level.
- Hold ambiguous, duplicate, missing or incomplete content out of publication. Programming remains an inventory pending approval, as specified by the document.
- Integrate read-only Activities endpoints through the BFF with bounded caching and server-side authorization.
- Show course cards, category/access filters, locked previews and a course viewer with ordered chapters and embedded Vimeo playback for eligible customers.
- Preserve existing benefits, authentication, points and journey rules. Do not fabricate progress, certificates or rewards.
- Offer a CAROBRA-branded gateway with separate Cursos and Bienestar image cards, each opening its own catalog while preserving the approved cumulative level rules.
- September 24 clarification: all route selections remain in Cursos by level, including Gold wellbeing topics. Publish the independent Bonda Bienestar library (videos and articles) from Bronze, preserving existing IDs and progress and excluding live events.

## Capabilities

### New Capabilities

- `bonda-course-catalog`: Approved Activities catalog, complete series, cumulative level policy and authenticated playback.

### Modified Capabilities

- `rewards-learning-experience`: Replace Courses placeholder with approved level-specific content and preview mode.
- `rewards-customer-site-experience`: Courses becomes an approved catalog rather than an unconditional placeholder.
- `site-application-architecture`: Preserve navigation while enabling the approved Courses destination.

## Impact

Site backend configuration, Activities adapter, curated policy, authenticated routes, Courses frontend and tests. No production database mutations or deployment. Source: CAROBRA_Rewards_Ruta_de_Cursos_FINAL.pptx, slides 1–35, and Bonda Activities Postman documentation.
