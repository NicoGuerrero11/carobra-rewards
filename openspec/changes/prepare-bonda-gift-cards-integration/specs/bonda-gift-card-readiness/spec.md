## ADDED Requirements

### Requirement: Gift cards must use local level visibility
The customer site SHALL render the gift-card section only for canonical ACTIVE journeys at Gold, Platinum or Titanium. It SHALL describe the full catalog and informational conversion of 3 points to 1 MXN without claiming an unverified partner balance. The rule MUST NOT require or implement external level permissions, deletion or segmentation.

#### Scenario: Eligible customer opens the microsite
- **WHEN** an active Gold customer with canonical Rewards ID views Benefits
- **THEN** the section links to https://carobrarewards.bonda.com without identity, credentials, autologin or Referrer

#### Scenario: Customer drops below Gold
- **WHEN** the canonical level becomes Silver
- **THEN** the section is absent from server-rendered HTML and no external revocation or deletion occurs

#### Scenario: Data is missing
- **WHEN** journey data is unavailable or restricted
- **THEN** the section is absent; if only the canonical number is missing for an eligible journey, the section explains it and disables the link

### Requirement: Member number must preserve identity
The site SHALL display existing nine-digit rewards_id as Número de socio Rewards on Home, Account and beside Bonda, grouped in threes. Copy MUST use the canonical value with accessible confirmation and a local fallback. No identity SHALL be generated or changed.

#### Scenario: Repeated copying
- **WHEN** the customer copies their number repeatedly
- **THEN** the same canonical value is copied without spaces or API writes

### Requirement: Affiliation and enrichment must be separate
The base affiliation SHALL require canonical ACTIVE customer/journey status and Bronze or above before first dispatch, and SHALL send only code and its existing welcome flag. Registration alone MUST NOT affiliate an invited customer. The prepared enrichment worker SHALL load canonical customer/profile/level data and require ACTIVE Gold or above and a matching confirmed existing affiliation before PATCH. Optional profile data SHALL remain in Carobra before Gold. Public navigation SHALL NOT depend on enrichment completion or coupon permission.

#### Scenario: Customer reaches Gold
- **WHEN** activated processing receives a relevant event for a confirmed existing affiliate at Gold
- **THEN** it compares HMAC revisions and sends only changed approved email/nombre/apellido/curp fields under the same code

#### Scenario: Default contract is pending
- **WHEN** the explicit text-CURP/PATCH agreement is unavailable
- **THEN** profile dispatch remains blocked even if Gold is reached

### Requirement: Local preparation must not contact real services
Preparation SHALL use synthetic transports, profiles and isolated databases. It SHALL NOT execute real migrations, affiliate writes, point operations or identity exports. The prepared migration and runtime MAY be registered with capture and processing disabled by default. No startup, GET or UI click SHALL trigger this new worker.

#### Scenario: Default deployment configuration loads
- **WHEN** configuration and composition are created
- **THEN** the profile runtime is inert and no database or transport operation is made by that construction

### Requirement: Profile synchronization must persist and reconcile safely
The store SHALL persist field HMAC checkpoints, a pre-dispatch intent and leased ownership with fencing. Queue generations SHALL preserve changes during processing. Ambiguous outcomes SHALL require explicit operation-scoped audited reconciliation without automatic resend. Raw personal fields SHALL NOT appear in checkpoints, events or review references.

#### Scenario: Lease expires
- **WHEN** a successor claims the customer
- **THEN** the prior owner cannot write a checkpoint or release the successor's lease

#### Scenario: Ambiguous mutation is reviewed
- **WHEN** authorized evidence confirms the operation APPLIED or NOT_APPLIED
- **THEN** a transaction records one consistent review and requeues current data; stale or contradictory reviews are rejected

#### Scenario: Process restarts
- **WHEN** a new store opens the same isolated database
- **THEN** the pending intent persists and prevents automatic duplicate dispatch

### Requirement: Every first-affiliation entrypoint must enforce Bronze
Registration, status/benefits access, retries, backfill and level-event processing SHALL share the canonical eligibility guard. No caller-supplied level SHALL authorize dispatch. The prepared event migration SHALL capture level/status changes transactionally with capture disabled by default. Existing ACTIVE affiliations SHALL survive downgrades without recreation or revocation.

#### Scenario: Invited customer reaches an entrypoint
- **WHEN** registration, affiliate-status, retry or backfill considers an invited customer without Bronze
- **THEN** no initial affiliate GET/POST is dispatched

#### Scenario: First product establishes Bronze
- **WHEN** Afore or another product produces an ACTIVE Bronze canonical journey and the authorized event processor is activated
- **THEN** one minimal affiliation is ensured, while profile enrichment remains gated to Gold

#### Scenario: Existing affiliate returns after downgrade
- **WHEN** an already ACTIVE affiliate drops below Bronze and later returns
- **THEN** no deletion, recreation or duplicate POST is performed

#### Scenario: Outcome is ambiguous
- **WHEN** minimal affiliation succeeds remotely but its acknowledgement is lost
- **THEN** a later eligible retry checks existence and converges without another POST when the affiliate is found

### Requirement: Earned points must be credited once with exact units
The prepared integration SHALL capture each positive ISSUANCE transactionally, preserve pending earnings before eligibility, and credit 1 Rewards point as 1 Bonda point only after canonical ACTIVE Gold+, matching ACTIVE affiliate, valid matching email and an unexpired intact source lot. Unknown POST outcomes MUST NOT automatically resend. It SHALL NOT debit the local ledger or change level when Bonda points are spent. Dispatch and reads SHALL default off.

#### Scenario: Eligible backlog becomes payable
- **WHEN** a customer reaches all prerequisites after earning several awards
- **THEN** processing sends each eligible unconfirmed award once, with each_amount equal to local points, without re-crediting a balance snapshot

#### Scenario: Confirmation is lost
- **WHEN** assignment may have happened but its response or local acknowledgement is lost
- **THEN** the durable operation requires audited APPLIED/NOT_APPLIED review; APPLIED verifies the exact movement and no automatic resend occurs

### Requirement: Spendable balance must come from Bonda
The UI SHALL distinguish Bonda balance from local recorded earnings, pending credits and verification cases. It SHALL show timestamped stale data on error, unknown without fabricated zero, and true zero when confirmed. Cache SHALL expire after 60 seconds on subsequent read. Local history MUST NOT fabricate external purchases from balance differences.

#### Scenario: Customer spends externally
- **WHEN** a subsequent read after cache expiry returns a lower balance
- **THEN** the UI displays that Bonda balance without another local debit or level reduction

#### Scenario: Provider cannot be reached
- **WHEN** a balance read fails
- **THEN** the last known balance is visibly stale with its observation time, or unknown when no identity-bound cache exists
