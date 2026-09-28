## ADDED Requirements

### Requirement: Customers can mark all current notifications as read
The notification page SHALL expose a top-right, keyboard-accessible "Marcar todas como leídas" action. One activation MUST persist all currently displayed unread notifications through the authenticated read operation without deleting them or affecting other customers. Merely visiting the page MUST NOT mark notifications as read.

#### Scenario: All reads succeed
- **WHEN** a customer activates the bulk action
- **THEN** all current pending notifications become read, the page and bell counters update, and the state remains read after reload

#### Scenario: Nothing is unread
- **WHEN** the inbox is empty, already read or unavailable
- **THEN** the bulk action is disabled and does not issue read requests

### Requirement: Read controls show truthful pending and failure states
Read controls SHALL prevent repeated activation while saving and SHALL only reflect successfully persisted changes. Failed rows MUST remain unread and retryable with a readable live status message. Individual reads MUST keep counters synchronized too.

#### Scenario: Partial failure
- **WHEN** some read requests fail
- **THEN** successful rows and counts update, failed rows remain unread and the bulk action can retry the remaining rows

#### Scenario: Individual reading
- **WHEN** a customer marks one notice as read
- **THEN** only that notice is persisted and both unread counters decrease after success

#### Scenario: Mobile and keyboard interaction
- **WHEN** the page is viewed at 320 pixels wide or operated with a keyboard
- **THEN** the bulk action remains readable and usable without horizontal overflow and announces its result

### Requirement: Notification presentation matches the compact customer experience
The notification page SHALL use compact headings, neutral white panels and readable Carobra colors consistent with Activity. It MUST preserve all notification titles, messages, dates and read behavior, without legacy oversized typography or decorative pastel gradients. Read state MUST be identifiable with text as well as color.

#### Scenario: Customer scans notifications
- **WHEN** the notification inbox is displayed
- **THEN** the compact heading and upper-right bulk action precede clearly separated readable rows with explicit read status

#### Scenario: Confirmed read updates the row
- **WHEN** an individual or bulk read succeeds
- **THEN** the corresponding row changes from Sin leer to Leída while preserving its content
