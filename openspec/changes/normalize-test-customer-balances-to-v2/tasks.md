## 1. Normalization engine

- [x] 1.1 Implement V1-lot candidate discovery and dry-run reporting for accounts with V2 journeys
- [x] 1.2 Implement transactional, idempotent compensation of unspent V1 lots with reservation and balance guards
- [x] 1.3 Add an explicit CLI command whose default mode is dry-run and whose mutation requires `--apply`

## 2. V2 customer experience

- [x] 2.1 Restrict V2 summary and detailed movement queries to canonical V2 ledger entries

## 3. Verification and delivery

- [x] 3.1 Add unit coverage for dry-run, apply, replay, and unsafe-account behavior
- [x] 3.2 Run backend tests and strict OpenSpec validation
- [ ] 3.3 Deploy the change to UAT and production
- [ ] 3.4 Dry-run, apply, and verify normalization in both current test populations
