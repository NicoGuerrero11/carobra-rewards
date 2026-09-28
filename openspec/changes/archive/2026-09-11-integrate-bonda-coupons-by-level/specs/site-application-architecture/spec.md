## ADDED Requirements

### Requirement: Bonda integration must remain behind the V2 site backend
The site backend SHALL be the only application that calls Bonda. It SHALL attach Bonda credentials, authenticate the Carobra customer, enforce the canonical level policy, and translate partner responses into stable Carobra contracts. The frontend MUST use same-origin Carobra routes and MUST NOT receive a Bonda API key, affiliate token, microsite identifier, or unrestricted partner URL.

#### Scenario: Browser loads the coupon catalog
- **WHEN** the authenticated frontend requests customer coupons
- **THEN** it calls a same-origin Carobra endpoint and the site backend performs any required Bonda request

#### Scenario: Inspect a customer response
- **WHEN** the site backend returns catalog, detail, or branch content
- **THEN** the payload contains no Bonda credentials, raw partner response, or unrestricted internal integration field

#### Scenario: Catalog reading is enabled
- **WHEN** the read-only Bonda catalog feature is active
- **THEN** the site backend does not provision affiliates, request coupon codes, read received-coupon history, or invoke the points ledger

### Requirement: Partner configuration must fail closed
The system SHALL validate the Bonda base URL against an explicit environment allowlist and SHALL keep live partner reads disabled when required configuration is missing. Affiliate provisioning and coupon-request controls MUST remain disabled independently. Missing Bonda configuration MUST NOT prevent the non-Bonda portions of Carobra from starting.

#### Scenario: Start development without Bonda credentials
- **WHEN** developers run the Carobra applications without a Bonda token or API key
- **THEN** authentication, registration, Rewards level, and non-Bonda pages continue to operate while live catalog reads remain disabled

#### Scenario: Configure an unapproved Bonda host
- **WHEN** the supplied Bonda base URL is outside the environment allowlist
- **THEN** configuration validation rejects live partner calls before any credential is transmitted

### Requirement: Customer navigation must expose only the approved primary destinations
The customer shell SHALL expose Inicio, Beneficios, Cursos, Productos, and Actividad as its primary destinations. It SHALL omit Ganar puntos, present Cursos as a truthful Próximamente page, and expose Ayuda and Notificaciones as accessible utility icons with visible hover and keyboard-focus labels.

#### Scenario: Customer scans the primary navigation
- **WHEN** the customer shell renders on desktop or mobile
- **THEN** Cursos replaces Ganar puntos, Ayuda appears as a question-mark utility beside Notificaciones, and both utility icons identify their destinations on hover and keyboard focus
