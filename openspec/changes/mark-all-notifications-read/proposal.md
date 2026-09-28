## Why

Customers currently have to mark each notification individually. A top-right action should mark all pending notifications in one interaction.

## What Changes

- Add a branded, accessible "Marcar todas como leídas" button in the notification header.
- Persist each unread notification using the existing authenticated endpoint and update list, page count and bell count after confirmed success.
- Prevent duplicate requests while saving; keep failed items unread and offer retry through the same button.
- Preserve individual reading and verify empty, loading, failure and reload behavior with isolated data.
- Follow-up: replace the legacy oversized headings and pastel gradient panels with a compact Activity-aligned notification layout; preserve notification content and reading behavior.

## Capabilities

### New Capabilities
- `notification-bulk-read`: One-click marking of the current notification inbox as read with truthful feedback and synchronized counts.

### Modified Capabilities
None.

## Impact

Notification frontend page/client behavior and isolated browser tests. No new endpoint, migration, dependency, changes to points, deployment or production testing writes.
