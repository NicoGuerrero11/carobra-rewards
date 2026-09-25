## Why

Actividad retains an oversized legacy hero and mixed legacy/brand styles. Pale text becomes unreadable on white backgrounds and the duplicate introductory blocks obscure the actual history.

## What Changes

- Replace the oversized hero with a compact header and account summary.
- Give timeline and point movements clean neutral surfaces, readable typography and Carobra accents consistent with Inicio.
- Show balance, event count and movement count separately rather than adding potentially overlapping records.
- Preserve event/movement content, signs, dates, approved expiration, authentication and safe empty/error states.
- Verify desktop/mobile layout and text contrast without production mutations.

## Capabilities

### New Capabilities
- `customer-activity-presentation`: Readable, compact, brand-consistent presentation of existing activity data.

### Modified Capabilities
None. Existing navigation, data ownership and color semantics continue to apply.

## Impact

Only the authenticated Activity frontend presentation and tests. No backend behavior, reward rules, data migrations, point adjustments, new dependencies, deployments or changes to the landing page.
