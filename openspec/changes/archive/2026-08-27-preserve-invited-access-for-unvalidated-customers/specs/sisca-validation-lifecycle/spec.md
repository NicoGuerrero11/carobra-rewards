## MODIFIED Requirements

### Requirement: Terminal negative SISCA evidence must preserve the invited Rewards journey
At any checkpoint, `MATCH_CANCELLED` or `MATCH_NOT_ELIGIBLE` SHALL atomically
change the validation to `CANCELLED`, record `cancelled_at`, clear future
scheduled work, preserve the registered customer's V2 journey as `INVITED`, and
keep redemption and validated-product capabilities unavailable. The system MAY
retain an internal non-active customer or product-evidence status for operations,
but MUST NOT present that status as an inactive or blocked Rewards membership.
The final case SHALL record that team notification is required.

#### Scenario: SISCA reports cancellation
- **WHEN** any checkpoint produces `MATCH_CANCELLED`
- **THEN** Rewards cancels the validation, preserves the invited V2 journey and registration award, keeps validated-product actions unavailable, and schedules no later checks

#### Scenario: Operation is not eligible
- **WHEN** any scheduled or initial check produces `MATCH_NOT_ELIGIBLE`
- **THEN** Rewards records the ineligible evidence for operations while the customer-facing V2 journey remains invited without falling back to V1

#### Scenario: Existing terminal-negative customer returns to the site
- **WHEN** a registered customer has a `CANCELLED` validation and no validated active product
- **THEN** the authenticated Rewards projection returns `INVITED` and does not describe the Rewards membership as inactive or blocked
