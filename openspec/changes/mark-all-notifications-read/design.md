## Context

The portal returns a bounded inbox of eight recent notifications. The authenticated same-origin POST `/api/v1/rewards/portal/notifications/read` already persists each identifier idempotently for the authenticated customer. Individual reading currently changes only the list, leaving both counters stale.

## Goals / Non-Goals

**Goals:** One upper-right action, persistent reads, truthful loading/errors and synchronized list/counts for both individual and collective actions. Keyboard and narrow-screen usability.

**Non-Goals:** Adding historical notification pagination, changing source projections, backend contracts, migrations or modifying production data during tests.

## Decisions

- Reuse existing per-notification writes with at most three concurrent requests instead of introducing a bulk endpoint for this eight-item inbox. Only the unread snapshot on click is targeted; future notifications remain unread.
- Share individual and bulk client handling. Disable read controls while a batch is pending. Change each row only after its successful response, decrement counts only for confirmed reads, and retain failed rows for retry.
- Show a live status message for pending, success and failure; disable the bulk action when there is nothing to mark or data is unavailable. Do not auto-mark on visiting the page.
- Use the existing Carobra button tokens in a top-right header action group, wrapping below on mobile. Update bell text/accessibility label; remove the badge when its count becomes zero.
- Tests use an isolated, customer/test-keyed in-memory read set and network failures. No production writes.
- User-approved visual follow-up: replace legacy portal presentation classes with a scoped customer-notifications layout matching Activity's compact heading, neutral white panels, blue accents and readable muted text. Preserve all notification titles/messages/dates and existing read handlers. Add explicit Sin leer/Leída status text, updated only after a confirmed read. Keep the bulk action top-right on desktop and reflow at narrow widths.

## Risks / Trade-offs

- Partial network failure → preserve successful changes, leave unsuccessful rows pending and show a retry message. Repeating the existing idempotent operation is safe.
- Repeated clicks → serialize UI operations with a busy guard and disabled controls; limit network concurrency and apply a request timeout.
- New events in another session → only the displayed snapshot is marked; a later page load retrieves authoritative new counts.
