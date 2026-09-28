## ADDED Requirements

### Requirement: V2 Rewards state must be persisted separately from customer identity
The persistence model SHALL store customer journey projections, level decisions,
product facts, profile activities, and their rule versions in domain records
separate from `customers`, raw SISCA check evidence, and points ledger entries.
Foreign keys SHALL preserve history and prohibit destructive loss of evidence
referenced by a decision.

#### Scenario: Record a level decision
- **WHEN** the evaluator promotes or downgrades a customer
- **THEN** persistence retains the decision and the facts it references without modifying customer identity or prior SISCA evidence

