## Context

The authenticated account page inherits legacy global portal selectors. Its headings and cards are oversized and its support mailto address is unconfirmed. Preferences already use a three-boolean PATCH contract; their form currently lacks pending/network-error handling and defaults to enabled when account data cannot load.

## Goals / Non-Goals

**Goals:** Match the compact Activity/Help visual system, retain personal details and all preference fields, provide keyboard-accessible controls, distinguish missing preferences from real settings and preserve contextual help.

**Non-Goals:** Profile editing, password changes, new notification channels, level changes, backend contract changes, database migrations or production writes.

## Decisions

- Use a page-specific `customer-account` stylesheet and existing Carobra tokens. Updating global portal selectors would risk unrelated pages. Use modest heading sizes, white bordered panels and a responsive main/sidebar grid.
- Keep identity read-only and preferences explicitly saved. Use native checkboxes styled as switches, with associated titles/descriptions and visible focus. Disable controls during a save, prevent duplicates and show success only after an OK response. Catch network/timeouts and retain selections for retry.
- Do not substitute enabled defaults when preferences are unavailable. Keep identity and help visible with an unavailable notice instead of an editable form. Reuse middleware-provided context and a bounded fallback request; mark personalized HTML private/no-store.
- Link to the existing Help page, whose support contact remains an explicitly labeled example. Do not add operational mailto links, promises of a submitted request or a verified security badge.
- Verify using the existing isolated mock backend and Playwright, including persisted preferences per test identity. Avoid save actions against localhost's production-backed services.

## Risks / Trade-offs

- Global styles can still affect native elements → scoped selectors and desktop/mobile visual checks.
- Save failures leave uncertain persistence → show a retry message without claiming success and keep the submitted values.
- Help cannot yet accept support requests → use truthful navigation labels instead of a contact/submission promise.

## Migration Plan

No data migration. Deploy frontend assets with the normal build; rollback the page and stylesheet if necessary. Keep the preference API unchanged.

## Open Questions

None blocking. The official support contact remains pending outside this change.
