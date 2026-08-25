## MODIFIED Requirements

### Requirement: A validated match must activate the registered customer
At any valid checkpoint, `MATCH_VALIDATED` SHALL atomically change the
validation to `VALIDATED`, record `validated_at`, clear future scheduled work,
and change the customer from `PENDING_VALIDATION` to `ACTIVE`. It SHALL also
publish or persist the safe AFORE product evidence required by the V2 Rewards
journey. The V2 level and points outcome MUST be idempotent and evaluated from
that evidence, not from the raw SISCA payload.

#### Scenario: Validate at the first checkpoint
- **WHEN** the `H24` check produces `MATCH_VALIDATED`
- **THEN** Rewards marks the validation `VALIDATED`, activates the customer, records the AFORE product evidence, and schedules no later checks

#### Scenario: Replay successful validation delivery
- **WHEN** processing receives the same validated SISCA evidence after the first successful transition
- **THEN** the system preserves one effective AFORE product fact and does not duplicate the V2 product outcome

