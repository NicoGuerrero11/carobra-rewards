## MODIFIED Requirements

### Requirement: A validated match must activate the registered customer and V2 journey
At any valid checkpoint, `MATCH_VALIDATED` SHALL atomically change the validation to `VALIDATED`, record `validated_at`, clear future scheduled work, change the customer from `PENDING_VALIDATION` to `ACTIVE`, synchronize the corresponding V2 product evidence, and recalculate the V2 level and redemption eligibility. This behavior MUST NOT depend on an optional Rewards V2 flag.

#### Scenario: Validate at the first checkpoint
- **WHEN** the `H24` check produces `MATCH_VALIDATED`
- **THEN** Rewards marks the validation `VALIDATED`, activates the customer and V2 product journey, recalculates level and eligibility, and schedules no later checks

#### Scenario: Replay validated evidence
- **WHEN** the same validated SISCA evidence is synchronized again
- **THEN** Rewards preserves one product projection and does not duplicate V2 awards

### Requirement: Terminal negative SISCA evidence must update the V2 journey
At any checkpoint, `MATCH_CANCELLED` or `MATCH_NOT_ELIGIBLE` SHALL atomically change the validation to `CANCELLED`, record `cancelled_at`, clear future scheduled work, change the customer to `INACTIVE`, synchronize the V2 product evidence as inactive or rejected, and recalculate V2 redemption eligibility. The final case SHALL record that team notification is required.

#### Scenario: SISCA reports cancellation
- **WHEN** any checkpoint produces `MATCH_CANCELLED`
- **THEN** Rewards cancels the validation, makes the customer and V2 product inactive, recalculates eligibility, and schedules no later checks

#### Scenario: Operation is not eligible
- **WHEN** any scheduled check produces `MATCH_NOT_ELIGIBLE`
- **THEN** Rewards cancels the validation and represents the ineligible evidence in V2 without falling back to V1
