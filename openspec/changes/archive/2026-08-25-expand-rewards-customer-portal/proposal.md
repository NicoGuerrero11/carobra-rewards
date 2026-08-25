## Why

The current Rewards portal explains balances, levels, products, and validation state, but it is still primarily informational and exposes the name of an internal validation provider. The customer experience now needs to become actionable and consistently Carobra-owned without activating unresolved Bonda, expiration, referral, AVE, or renewal rules.

## What Changes

- Replace customer-facing SISCA references, provider names, checkpoints, source identifiers, and technical evidence with clear Carobra-owned validation and product language.
- Add a personalized next-action area driven by the authenticated journey state and approved actions.
- Add a customer activity center for questionnaires, recommended content, requested documents, completed activity, and contextual help.
- Add a unified customer timeline for registration, points, product lifecycle, activity, and level changes using safe backend events.
- Add customer-safe product detail with status, activation date, level impact, and lifecycle guidance without exposing evidence providers.
- Add an in-portal notification center for validation, product, points, level, activity, document, and learning updates.
- Expand the account menu into profile, communication preferences, consent/security guidance, and support.
- Turn Courses into a personalized learning experience with recommendations and progress, while only counting learning activity when an approved rule declares it qualifying.
- Preserve Bonda catalog/redemption, point expiry, referrals, AVE, and renewals behind their existing disabled feature flags.

## Capabilities

### New Capabilities

- `rewards-customer-action-center`: Personalized next actions, questionnaires, content, document requests, completion states, and contextual help.
- `rewards-customer-history`: Safe customer timeline, product detail, and notification inbox derived from audited Rewards events.
- `rewards-customer-account`: Customer profile summary, communication preferences, consent/security guidance, and support access.
- `rewards-learning-experience`: Personalized course recommendations, course progress, completion, and optional qualification as configured profile activity.

### Modified Capabilities

- `customer-onboarding-auth`: Authenticated customer status messaging becomes provider-agnostic and exposes only Carobra-owned customer states.
- `site-application-architecture`: Customer-facing contracts and pages must not expose internal validation providers, evidence references, checkpoints, or raw integration errors.

## Impact

- **Site backend:** add safe read models and authenticated endpoints for action items, timeline, notifications, product detail, account preferences, and learning progress.
- **Database:** add only the persistence needed for customer notifications, preferences, learning progress, and document-request metadata; retain provider evidence and uploaded-file storage behind internal boundaries.
- **Site frontend:** expand Rewards, Courses, and Account experiences and remove internal provider terminology from all customer routes.
- **API:** identity and authentication remain authoritative; only bounded profile/preferences operations are added if the existing contracts do not cover them.
- **External systems:** no new Bonda or SISCA customer-facing dependency is introduced. SISCA remains an internal evidence source only.
