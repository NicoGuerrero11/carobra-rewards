## Context

The screenshot shows the legacy hero enlarged by page rules while shared branding overrides its background to white, leaving pale copy unreadable. Legacy portal-section styles also introduce a purple surface. Existing authenticated V2 portal data already supplies the timeline, ledger entries and current balance.

## Goals / Non-Goals

**Goals:** Readable compact Activity page matching Inicio, truthful separate summaries and accessible responsive history.

**Non-Goals:** Backend/data changes, new activity sources, filtering/export, reward calculations, migrations, deployment and changes to other destinations.

## Decisions

- Replace legacy presentation classes with a scoped customer-activity namespace instead of layering more global overrides. Keep the authenticated fetch and existing content mapping.
- Remove the oversized introduction; use one compact title/subtitle and a three-column summary of the portal balance, timeline count and ledger count. Separate counts avoid suggesting overlapping sources are unique events.
- Keep a white timeline panel beside a white movements panel, stacking on mobile. Preserve all supplied entries, order, descriptions, dates, signs and approved expiration.
- Use only Carobra tokens: navy headings, blue accents, legible muted text, gold balance, positive/negative amounts with visible signs and text labels (not color alone). No gradients outside Inicio's membership block.
- Preserve empty/error distinction and add a same-page retry link. No fake zero balance when the portal is unavailable.

## Risks / Trade-offs

- Shared legacy selectors can still leak → avoid legacy page/hero/panel/list classes; test computed backgrounds and contrast.
- Long content or amounts can overflow → wrap titles, keep amount labels in a bounded column and stack narrow layouts; cover 320px.
- Counts are the records returned by the existing portal, not a new lifetime total → label them separately as displayed records and do not deduplicate or change queries.

## Migration Plan

No migrations. Frontend-only change, validated in the isolated browser test harness. Local Astro reloads it automatically; rollback consists of restoring this page and removing its scoped stylesheet.
