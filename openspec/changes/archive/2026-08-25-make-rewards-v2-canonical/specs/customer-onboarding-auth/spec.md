## MODIFIED Requirements

### Requirement: Completed registration must create the customer lifecycle atomically and establish V2 idempotently
The system SHALL create the auth user, customer, terms consent record, and initial pending SISCA validation atomically when customer registration completes. The site Rewards flow SHALL establish a V2 `INVITED` journey and V2 registration award idempotently and MUST retry that projection during the authenticated V2 read or backfill if its first attempt is temporarily unavailable. The operation MUST NOT create or select a V1 rewards model.

#### Scenario: Registration creates validation and Rewards V2 lifecycle
- **WHEN** customer registration completes successfully
- **THEN** the system persists an auth user, customer, accepted terms consent, `PENDING` SISCA validation and establishes a V2 invited journey with one idempotent V2 registration award

#### Scenario: Recover a temporarily unavailable V2 projection
- **WHEN** customer identity registration commits but the first V2 projection attempt is temporarily unavailable
- **THEN** the next authenticated V2 journey read or environment backfill establishes the same invited journey without using V1 or duplicating the award
