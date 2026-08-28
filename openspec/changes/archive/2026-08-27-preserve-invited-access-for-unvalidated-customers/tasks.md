## 1. State Projection

- [x] 1.1 Correct Rewards eligibility classification so pending validation is not reported as an inactive customer
- [x] 1.2 Ensure terminal-negative and attention-required validations retain the customer-facing `INVITED` V2 journey and provider-neutral guidance

## 2. Customer Navigation

- [x] 2.1 Remove validation/customer-status route redirects while retaining authentication and canonical customer entry routing
- [x] 2.2 Remove inactive/blocked presentation fallbacks derived from operational customer status and keep unavailable actions gated in-place

## 3. Regression Coverage

- [x] 3.1 Add backend tests for pending, rejected/cancelled, attention-required, and active state projection
- [x] 3.2 Add browser coverage proving invited customers can open every primary and account destination without redirects
- [x] 3.3 Run focused backend, frontend contract, and Playwright tests and resolve any regressions
