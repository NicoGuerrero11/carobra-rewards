## ADDED Requirements

### Requirement: Advisor attribution must be distinct from customer referral attribution
The system SHALL record whether a customer or product was originated by an advisor, self-registration, or customer referral. Customer-generated referrals MUST NOT create advisor referral compensation merely because the advisor originated the referring customer.

#### Scenario: Advisor-originated customer refers another customer
- **WHEN** a customer originally attributed to an advisor creates a valid customer referral
- **THEN** the referral belongs to the customer and does not create advisor referral participation

### Requirement: Advisor compensation policies must be versioned and auditable
The system SHALL calculate compensation using an effective policy version and preserve gross commission, advisor share, customer-benefit share, calculation inputs, activity evidence, status, and external payment or export reference.

#### Scenario: Calculate an enabled platform cross-sell split
- **WHEN** a qualifying platform product event uses the approved 80/20 policy
- **THEN** the system records 80 percent as advisor share and 20 percent as customer product benefit without treating either amount as universal points

### Requirement: Platform activity conditions must use explicit evidence
When an approved policy conditions full commission on customer platform activity, the system SHALL evaluate the configured activity definition at the commission cutoff. An undefined activity rule MUST NOT silently grant or remove compensation.

#### Scenario: Activity-dependent policy is not configured
- **WHEN** compensation reaches calculation without an approved activity definition
- **THEN** the system holds the calculation for review rather than guessing the advisor percentage

### Requirement: Advisor behavior rewards must remain separate from customer points
Any internal convention points or advisor incentives for registration and customer permanence SHALL use an advisor-specific ledger or export and MUST NOT modify a customer's universal Rewards balance.

#### Scenario: Advisor earns a registration convention incentive
- **WHEN** an enabled advisor policy recognizes a qualifying platform registration
- **THEN** the advisor incentive is recorded separately and the customer's point balance is unchanged

### Requirement: Anti-abuse controls must flag suspicious advisor activity
The system SHALL enforce configured registration-volume limits and record review flags for mass registrations, conflicting attribution, or self-referral patterns. Review data MUST be auditable and MUST NOT expose unnecessary customer-sensitive fields.

#### Scenario: Advisor exceeds weekly registration limit
- **WHEN** attributed registrations exceed the configured weekly threshold
- **THEN** the system flags or holds the excess cases according to policy without automatically paying compensation

