## ADDED Requirements

### Requirement: Gift-card access configuration must remain inert pending partner feedback
The site backend SHALL reserve an internal giftCardAccess configuration containing status PENDING_BONDA_FEEDBACK, enabled false, loginMethod null, identifierField rewards_id and minimumLevel GOLD. The selected identifier SHALL refer to the Carobra profile field and MUST NOT imply a confirmed Bonda payload mapping or authentication mechanism. This change MUST NOT add an environment switch or runtime flow that enables gift-card access.

#### Scenario: Configuration loads without an access agreement
- **WHEN** the site backend loads its configuration
- **THEN** gift-card access is pending and disabled, with Rewards ID selected locally and no inferred login method or external field mapping

### Requirement: Preparation must not connect to Bonda
This change MUST NOT add or execute network calls, affiliate writes, point operations, identity exports, or connected tests. Existing unrelated integrations SHALL remain unchanged. Future integration work SHALL require Bonda feedback and a subsequent user instruction.

#### Scenario: Preparation is verified
- **WHEN** configuration and type checks run locally
- **THEN** no Bonda request is made and no real identity or balance is changed

#### Scenario: Bonda feedback becomes available
- **WHEN** the provider supplies an access contract without a subsequent user instruction to connect
- **THEN** gift-card access remains disabled

### Requirement: Readiness documentation must distinguish base affiliation from level-gated profile data
The preparation contract SHALL record Rewards ID as the future base affiliation link through the payroll API and CURP/email as additional data restricted to Gold, Platinum and Titanium customers. It SHALL record GOLD as the minimum level and MUST NOT treat an affiliation, active product or positive balance as sufficient gift-card eligibility. This planning rule MUST NOT activate any synchronization in this change or prescribe replacing the existing affiliate code with CURP.

#### Scenario: Minimum level is configured
- **WHEN** the site backend loads the preparation configuration
- **THEN** it records GOLD as the gift-card threshold while access remains disabled and no additional customer data is sent

#### Scenario: Below-threshold customers are described
- **WHEN** the planned data flow is reviewed for Invitado, Bronze or Silver
- **THEN** it excludes gift-card CURP/email provisioning for those levels even if a base affiliation exists

#### Scenario: Base affiliation is described
- **WHEN** the team reviews the planned Rewards ID link
- **THEN** the contract distinguishes that link from the later level-gated CURP/email update on the same affiliate and preserves the ban on current external calls

### Requirement: Local gift-card section must explain policy without activating external access
The customer site SHALL show a nested Benefits section and reuse it on the existing gift-card route. It SHALL describe Gold, Platinum and Titanium as meeting the level threshold, the full catalog without a level-based ceiling, and the informational conversion of 3 points to 1 MXN. It MUST keep access disabled regardless of coupon flags, balance or level until the external access contract and authorized URL exist. Missing or restricted account data MUST fail closed.

#### Scenario: Gold customer views gift cards
- **WHEN** an active Gold customer with a canonical Rewards ID views Benefits
- **THEN** the section says the level requirement is met while Bonda access remains in preparation, with no external link or balance claim

#### Scenario: Customer copies the member number
- **WHEN** a canonical nine-digit Rewards ID appears on Home, Account or the Bonda section
- **THEN** it is labelled Número de socio Rewards, grouped in threes and copied unchanged without spaces, with accessible feedback and a local fallback

#### Scenario: Identity or portal data is missing
- **WHEN** identity is missing, legacy or malformed, or the portal is unavailable
- **THEN** no ID is generated or changed and no external access is enabled
