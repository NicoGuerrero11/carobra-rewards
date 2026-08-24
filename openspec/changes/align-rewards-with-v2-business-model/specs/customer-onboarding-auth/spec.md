## ADDED Requirements

### Requirement: Registered customers must receive an invited-aware authenticated experience
The authenticated status experience SHALL distinguish a newly registered
customer from an inactive customer. While the initial product validation is
pending, it SHALL identify the customer as `INVITED`, present safe validation
status, and allow access to the limited Rewards journey summary.

#### Scenario: New customer logs in before SISCA validates
- **WHEN** a newly registered customer authenticates while their initial SISCA validation is pending
- **THEN** the site grants access to the invited experience rather than treating the customer as an active product holder

