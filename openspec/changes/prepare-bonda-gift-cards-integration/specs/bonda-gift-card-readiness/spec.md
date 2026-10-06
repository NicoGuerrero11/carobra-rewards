## ADDED Requirements

### Requirement: Gift-card access configuration must remain inert pending partner feedback
The site backend SHALL reserve an internal giftCardAccess configuration containing status PENDING_BONDA_FEEDBACK, enabled false, loginMethod null and identifierField curp. The selected identifier SHALL refer to the Carobra profile field and MUST NOT imply a confirmed Bonda payload mapping or authentication mechanism. This change MUST NOT add an environment switch or runtime flow that enables gift-card access.

#### Scenario: Configuration loads without an access agreement
- **WHEN** the site backend loads its configuration
- **THEN** gift-card access is pending and disabled, with CURP selected locally and no inferred login method or external field mapping

### Requirement: Preparation must not connect to Bonda
This change MUST NOT add or execute network calls, affiliate writes, point operations, identity exports, or connected tests. Existing unrelated integrations SHALL remain unchanged. Future integration work SHALL require Bonda feedback and a subsequent user instruction.

#### Scenario: Preparation is verified
- **WHEN** configuration and type checks run locally
- **THEN** no Bonda request is made and no real identity or balance is changed

#### Scenario: Bonda feedback becomes available
- **WHEN** the provider supplies an access contract without a subsequent user instruction to connect
- **THEN** gift-card access remains disabled
