## ADDED Requirements

### Requirement: Rewards eligibility must require validated active AFORE service
The site backend SHALL consider a customer Rewards-eligible only when the existing API authenticates that customer and the necessary Carobra-owned Neon facts identify the customer as `ACTIVE`, the SISCA validation as `VALIDATED`, and the AFORE customer-service relation as `ACTIVE`. Every Rewards read and command MUST enforce this rule on the site backend.

#### Scenario: Eligible customer accesses Rewards
- **WHEN** an authenticated customer satisfies all three eligibility conditions
- **THEN** the site backend permits access to that customer's Rewards account and capabilities

#### Scenario: Pending customer requests a Rewards resource directly
- **WHEN** an authenticated customer with pending SISCA validation requests a Rewards operation
- **THEN** the site backend rejects the operation with `rewards_not_eligible` and returns no Rewards account data

### Requirement: Site-backend activation must create the account and registration award atomically
When the site backend first observes validated active AFORE evidence, it SHALL create exactly one Rewards account and issue exactly one 2,000-point registration award in one Rewards database transaction. The FastAPI SISCA transaction remains independent and MUST NOT write Rewards state.

#### Scenario: First eligible Rewards request
- **WHEN** a validated active AFORE customer first enters the Rewards experience
- **THEN** the site backend commits one Rewards account and one 2,000-point credit together

#### Scenario: Rewards activation persistence fails
- **WHEN** account creation or initial-award persistence fails
- **THEN** the Rewards transaction rolls back while the already persisted SISCA validation remains unchanged and can be observed again safely

### Requirement: Rewards account activation must be replay-safe
The site-backend activation operation SHALL use database uniqueness and deterministic idempotency so repeated requests, backfill, or concurrent observation cannot create duplicate accounts or registration awards.

#### Scenario: Observe validated evidence concurrently
- **WHEN** two site-backend workers observe the same validated customer
- **THEN** exactly one account and one registration award exist and both workers converge on that result

### Requirement: Ineligible customers must retain a separate authenticated experience
Authenticated customers who are not Rewards-eligible SHALL retain access to safe profile and SISCA validation information through the existing API-backed site routes but MUST NOT see a balance, earning opportunities, catalog availability, or redemption controls.

#### Scenario: Pending customer opens the customer area
- **WHEN** an authenticated pending customer enters the customer site
- **THEN** the site presents the validation-status experience and does not expose Rewards navigation or values
