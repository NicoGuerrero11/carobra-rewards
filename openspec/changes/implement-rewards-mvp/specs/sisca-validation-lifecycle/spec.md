## MODIFIED Requirements

### Requirement: A validated match must activate the registered customer and expose safe evidence
At any valid checkpoint, `MATCH_VALIDATED` SHALL atomically change the API-owned validation to `VALIDATED`, record `validated_at`, clear future scheduled work, change the customer from `PENDING_VALIDATION` to `ACTIVE`, and activate the AFORE customer-service relation. The API SHALL expose those safe facts to the authenticated site backend. It MUST NOT create a Rewards account, issue points, store Rewards state, or provide SISCA access to Carobra's database.

#### Scenario: Validate at the first checkpoint
- **WHEN** the `H24` check produces `MATCH_VALIDATED`
- **THEN** the API marks the validation `VALIDATED`, activates the customer and AFORE relation, and schedules no later SISCA checks

#### Scenario: Site backend reads validation evidence
- **WHEN** an authenticated site-backend request asks for the customer's validation status
- **THEN** the API returns only the safe customer and AFORE validation facts needed for Rewards eligibility

#### Scenario: Replay a validated checkpoint
- **WHEN** a completed validated transition is delivered again
- **THEN** the API preserves the existing validation and active relation without invoking any Rewards operation
