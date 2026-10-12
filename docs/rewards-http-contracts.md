# Rewards HTTP contracts

## Scope and compatibility

These contracts apply to every `/api/v1/rewards/*` resource. Existing registration,
authentication, customer, and SISCA proxy routes keep their current upstream status codes,
payloads, cookies, and normalized form-error codes; they are not converted to Rewards resource
responses.

## Error envelope

Rewards failures return one JSON shape with the relevant HTTP status:

```json
{
  "error": {
    "code": "insufficient_points",
    "message": "Available points are insufficient"
  }
}
```

Stable Rewards codes are `rewards_not_eligible`, `unauthenticated`, `duplicate_event`,
`insufficient_points`, `inventory_unavailable`, `monthly_limit_reached`, `self_referral`,
`rule_disabled`, `invalid_state_transition`, and `forbidden`. HTTP routing may additionally use
`invalid_request`, `not_found`, and `api_unavailable`.

The public envelope never includes exception text, stack traces, SQL details, customer identity,
point-sensitive diagnostic data, or internal rule-disable reasons. Clients branch on `code`; the
human-readable `message` is stable display text, not a machine identifier.

## Cursor pagination

Every top-level Rewards collection uses the same query parameters:

- `limit`: optional positive integer; defaults to 25 and cannot exceed 100;
- `cursor`: optional opaque URL-safe token returned by the preceding page.

The response shape is:

```json
{
  "items": [],
  "pagination": {
    "limit": 25,
    "next_cursor": null,
    "has_more": false
  }
}
```

Clients must not interpret, construct, persist customer data in, or modify a cursor. A non-null
`next_cursor` means another page may be requested; `has_more` mirrors that fact. Invalid cursors,
limits outside 1–100, and pages exceeding the requested limit are rejected.

Nested summary previews such as `recent_movements` and referral progress on a dashboard are not
standalone collection endpoints. When a full history or catalog collection is exposed, it must
use this contract rather than adding offset/page-number variants.

## Bonda balance and navigation reads

`GET /api/v1/rewards/bonda-balance` authenticates the API session on each request
and derives the customer from that session. It accepts no customer selector and
returns `Cache-Control: no-store`. It does not provision affiliates, assign
points, redeem a coupon, or synchronize the Rewards journey. It can refresh and
persist a balance observation using the existing bounded wallet GET.

```json
{
  "status": "UNAVAILABLE",
  "available": null,
  "observed_at": null,
  "pending": null,
  "verification_required": null
}
```

Status is `DISABLED`, `FRESH`, `STALE`, or `UNAVAILABLE`. Monetary point strings
remain exact integers; `null` is unknown, distinct from the string `"0"`.
A stale observation retains its timestamp and must not be presented as current.
The existing 60-second freshness window and provider failure behavior remain.
An unavailable points runtime returns 503; invalid authentication preserves 401.

Journey and portal summaries include a **local observation** of Bonda points;
they no longer refresh the external wallet while rendering a page. A client
showing a missing or stale balance may call the dedicated endpoint separately.

`GET /api/v1/rewards/customer-context` no longer retains resolved customer,
validation, evidence or portal values across requests. Overlapping context reads
of the same session can share only an unresolved identity read. Logout invalidates
that pending entry. Side-effect-free course reads and coupon previews can also share pending
identity reads of the exact session. Commands and reads that can provision,
reconcile or synchronize independently revalidate API identity; redemption checks remain unchanged. Portal synchronization keeps its
existing current-projection fast path and idempotent stale-evidence repair.

The optional `include=home|benefits|courses` query on customer context returns
`navigation_modules`. Each requested module is `{status: number, data: T | null}`:
`coupons` and `courses` for home; `coupons` and, when applicable, `history` for
benefits; `courses` for courses. Invalid/absent include values preserve the
original response shape. Failed modules carry 503/null rather than trigger a
second focused request. A partial failure does not invalidate successful modules.

These operations reuse the freshly authenticated evidence of this one request.
Home preview (four items, preview-only) and course reads overlap portal projection
after successful evidence synchronization. Benefits requires a successful portal,
loads catalog (50 items), then loads history only for AVAILABLE access, ACTIVE
affiliation and nonempty catalog. Existing resource-level checks still apply.
Wait budgets remain home 5 seconds and courses 12 seconds; benefits has no new
budget. These bound waiting, not cancellation of all underlying provider work.
The frontend falls back to focused routes only when the optional module is absent,
not when its data is null. `auth-context` Server-Timing includes bundled modules.
