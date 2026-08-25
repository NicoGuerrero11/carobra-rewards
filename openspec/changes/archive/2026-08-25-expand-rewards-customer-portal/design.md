## Context

The authenticated portal already consumes a V2 journey summary, activity detail, product facts, and ledger movements. It exposes level and redemption state correctly, but customer pages still mention SISCA and the portal does not turn the audited domain data into next actions, a unified history, customer-safe product detail, account guidance, or learning progress.

The site backend remains the Rewards-domain authority while the API remains the identity/session authority. Bonda, expiration, AVE, referrals, and renewals remain disabled. The portal must stay useful with empty catalogs and unresolved business rules.

## Goals / Non-Goals

**Goals:**

- Present every customer state in Carobra-owned language without exposing validation providers or evidence internals.
- Add one authenticated portal contract for actions, timeline, product detail, notifications, account summary, and learning state.
- Derive customer history from existing immutable events instead of creating a second history source.
- Persist only customer-owned presentation state such as preferences and learning progress.
- Support document requests and a safe upload-initiation contract without storing unbounded binary content in application JSON or database metadata.
- Keep all modules truthful when no actions, courses, documents, or benefits are configured.

**Non-Goals:**

- Activating Bonda catalogs or redemption.
- Approving point expiry, Plata thresholds, AVE, referral, or renewal rules.
- Exposing SISCA, source IDs, checkpoints, raw evidence, or provider failures to customers.
- Implementing object storage inside the site backend. Binary upload requires a configured storage adapter and short-lived upload target.
- Letting frontend state determine points, levels, product status, or activity qualification.

## Decisions

### 1. Use a provider-neutral customer portal projection

The site backend will expose a `RewardsCustomerPortal` contract containing next actions, safe timeline entries, notifications, product detail, account preferences, learning progress, and document requests. Provider fields and source references are excluded by construction. Existing journey endpoints remain compatible.

Alternative considered: compose each area entirely in Astro from several raw endpoints. Rejected because provider redaction, event ordering, and action selection must be consistent and testable server-side.

### 2. Derive history and notifications from authoritative events

Timeline entries are projected from registration, product-fact events, level decisions, profile activities, and ledger movements. Notifications use deterministic event identities and customer-safe templates. Read/unread state may be persisted separately without copying event payloads.

Alternative considered: write a new timeline row for every event. Rejected because it could drift from the audited source and complicate replay.

### 3. Make actions server-owned and configuration-aware

The portal selects a primary action from journey state, configured activity opportunities, document requests, and learning assignments. It never promises points or level progress unless an approved rule supplies that information. Completing an action calls an authenticated backend command with an idempotency key.

### 4. Keep document binaries outside Rewards application records

Document requests and submissions store bounded metadata only. An upload is enabled only when a storage adapter returns a short-lived target restricted by customer, request, MIME type, and size. Without that adapter the customer sees the request and a clear unavailable state, not a fake success.

### 5. Keep account preferences separate from identity

The API remains authoritative for name, email, phone, password, sessions, and consent. The site backend owns only Rewards presentation preferences such as communication topics. Identity edits and password changes use API-owned contracts when enabled.

### 6. Learning progress is not automatically Rewards progress

Course assignments and progress are customer-facing learning state. Completion becomes qualifying profile activity only when an active versioned rule explicitly maps that course or content type to a qualifying activity.

### 7. Preserve a compact primary navigation

The main navigation remains Rewards, Recompensas, Cursos, and Gift Cards. Notifications and Account are utility controls. Actions, timeline, products, documents, and help live inside Rewards rather than adding more top-level destinations.

## Risks / Trade-offs

- [A single portal response becomes large] → Keep bounded collections and offer cursor detail endpoints if histories grow.
- [Derived notifications reorder after backfill] → Use stable event time and deterministic IDs, with read state keyed to the stable ID.
- [Customer action appears without approved value] → Omit point promises and explain only the approved operational action.
- [Document upload adapter is unavailable] → Preserve the request and show support guidance; never accept binary data through generic metadata endpoints.
- [Legacy customer copy leaks provider names] → Add automated customer-route assertions for forbidden terminology and provider-shaped fields.
- [Courses imply benefits or level progress] → Keep learning and Rewards qualification separate in both contracts and UI.

## Migration Plan

1. Add the provider-neutral contract and automated redaction assertions without removing existing journey endpoints.
2. Add additive preference, notification-read, learning-progress, and document-request metadata persistence if required by configured content.
3. Release portal sections with truthful empty states and feature-gated commands.
4. Enable assignments and document upload only when server configuration and storage adapter are available.
5. Roll back by disabling the expanded portal projection and returning to the existing journey summary; preserve all authoritative events and customer preferences.

## Open Questions

- Which communication topics and channels will Carobra allow customers to configure initially?
- Which object-storage provider will issue document upload targets?
- Which first questionnaires, courses, and document requests are approved for real customers?
- Which identity fields may customers edit without assisted support?
