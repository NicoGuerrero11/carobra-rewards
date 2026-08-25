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
