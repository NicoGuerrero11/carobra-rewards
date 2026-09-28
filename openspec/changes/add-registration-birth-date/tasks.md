## 1. API and persistence

- [x] 1.1 Add optional date-only registration/profile contracts, server validation and safe error mapping.
- [x] 1.2 Persist the date with registration and add an additive nullable-column migration without backfill or Rewards side effects.

## 2. Registration experience

- [x] 2.1 Add the optional accessible date field with browser validation and payload/error handling.
- [x] 2.2 Remove the visible optional suffix at the user's request, preserve optional validation, and verify the exact label on desktop and mobile.

## 3. Verification and rollout

- [x] 3.1 Test valid/omitted/invalid dates, API mapping, persistence and migration safety; run relevant automated checks.
- [x] 3.2 Verify desktop/mobile registration without production registrations and record evidence.
- [x] 3.3 Apply only the new migration after explicit authorization, activate the updated local stack and verify the field and schema without changing existing customer data.
