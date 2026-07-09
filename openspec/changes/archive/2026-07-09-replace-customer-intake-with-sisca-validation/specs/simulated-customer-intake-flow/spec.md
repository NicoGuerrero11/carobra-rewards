## REMOVED Requirements

### Requirement: The system must expose a single provisional HTTP entrypoint for simulated customer intake
**Reason**: The full-profile SISCA intake direction is superseded by Rewards-owned registration and outbound SISCA validation.
**Migration**: Remove `POST /api/v1/customers/intake` from runtime routing and OpenAPI after the replacement validation flow is enabled.

### Requirement: The provisional simulated intake payload must be structurally validated exactly
**Reason**: Rewards no longer accepts a SISCA-owned customer profile payload.
**Migration**: Validate customer data in the future registration contract and SISCA data in the validation adapter.

### Requirement: The simulated customer intake endpoint must expose an opaque HTTP request identifier for every execution
**Reason**: The endpoint is being retired.
**Migration**: Generate request identifiers for every physical outbound SISCA validation attempt.

### Requirement: The simulated customer intake endpoint must document the request identifier as a response header in OpenAPI
**Reason**: The endpoint is being removed from OpenAPI.
**Migration**: Document tracing on the replacement internal validation operation where applicable.

### Requirement: The simulated customer intake endpoint must emit minimal structured HTTP trace logs without sensitive data
**Reason**: The endpoint is being retired.
**Migration**: Emit safe telemetry for internal validation execution and outbound SISCA calls.

### Requirement: Structural validity implies simulated approval only for this change
**Reason**: Structural validity of registration must never simulate SISCA approval.
**Migration**: Create a pending validation and apply SISCA outcomes at scheduled checkpoints.

### Requirement: The simulated intake flow must use an application use case independent from HTTP and SQLAlchemy
**Reason**: The simulated intake use case is replaced.
**Migration**: Preserve the architectural boundary in the new validation creation and execution use cases.

### Requirement: A new simulated intake must create the approved customer atomically
**Reason**: A registered customer now exists before SISCA approval.
**Migration**: Create the customer and pending validation atomically from Rewards registration.

### Requirement: The accepted request payload must be preserved intact before domain normalization
**Reason**: The new SISCA contract does not accept a full customer payload.
**Migration**: Persist typed validation evidence and preserve Rewards-owned registration data under its future contract.

### Requirement: The flow must be idempotent by external request key
**Reason**: SISCA no longer pushes externally keyed intake events.
**Migration**: Enforce idempotency per validation, checkpoint, and attempt.

### Requirement: CURP linked to an active AFORE customer with a different NSS must end as a controlled conflict
**Reason**: NSS is not sent by SISCA in the validation contract and identity conflict does not belong to the outbound validation response.
**Migration**: Resolve registration identity conflicts in the future registration capability.

### Requirement: CURP already linked to an AFORE customer must produce ALREADY_ACTIVE without creating duplicates
**Reason**: Existing-customer registration behavior is not a SISCA intake responsibility.
**Migration**: Define existing identity handling in the future registration capability.

### Requirement: ALREADY_ACTIVE requires an ACTIVE AFORE relation
**Reason**: `ALREADY_ACTIVE` is an intake outcome removed from the validation lifecycle.
**Migration**: Use customer, service-relation, and validation states directly.

### Requirement: Rewards ID generation must be explicit, opaque, and retryable only on Rewards ID collision
**Reason**: Rewards ID generation moves from simulated intake to Rewards registration.
**Migration**: Preserve the generator and bounded collision behavior in the registration use case.

### Requirement: AFORE must be resolved by service code and missing AFORE must abort the flow
**Reason**: The simulated intake flow is removed.
**Migration**: Resolve `AFORE` when a validated case activates its customer-service relation.

### Requirement: The simulated flow must handle a CURP creation race without creating a second identity
**Reason**: Customer creation races belong to Rewards registration rather than SISCA validation.
**Migration**: Preserve normalized CURP uniqueness and define race handling in the future registration capability.

### Requirement: Any failure before commit must roll back the complete simulated intake operation
**Reason**: The simulated intake transaction no longer exists.
**Migration**: Apply atomic rollback to registration plus validation creation and to check plus state transition.

### Requirement: The simulated flow must protect sensitive data in responses and generic exposure
**Reason**: The simulated endpoint is retired.
**Migration**: Apply safe response and logging rules to registration and validation APIs.

### Requirement: The provisional intake endpoint must document one reusable HTTP error envelope
**Reason**: The provisional endpoint is removed from OpenAPI.
**Migration**: Define reusable safe error envelopes on replacement API operations.

### Requirement: The simulated intake capability must preserve architectural independence
**Reason**: The capability is removed, although its architectural principle remains valid.
**Migration**: Keep validation application services independent from FastAPI and SQLAlchemy.
