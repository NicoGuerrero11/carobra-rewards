# Rewards scheduler runbook

## Purpose

Rewards schedulers process persisted work using one fixed `asOf` instant, bounded batches,
unique job business keys, and each processor's transactional replay protection. The runner does
not define business schedules or retain timers in memory.

## Categories and registration

Register each processor with `dueJobTask(category, name, processor, safeFailureCode)` and execute
it through `BoundedSchedulerRunner`.

| Category | Current or expected processors |
| --- | --- |
| `awards` | Birthday, AFORE anniversary, and referral-permanence jobs |
| `expiration` | Point-lot expiration jobs |
| `notification` | Missing-cohort scheduling followed by expiration-notification delivery |
| `inventory` | Inventory reconciliation or promotion processors when their policies are enabled |
| `reporting` | Persisted financial snapshot/export processors when an operational cadence is enabled |

Inventory and reporting processors use the same contract. Do not invent a cadence or enable a
processor until its policy exists; an intentionally disabled category should have no registered
task, not an in-memory timer.

## Safe invocation

Provide these values from the deployment scheduler:

- `asOf`: one valid UTC instant reused across the full run;
- `workerId`: a non-sensitive deployment/worker label;
- `batchSize`: 1–1,000 jobs;
- `maxBatchesPerTask`: 1–100 catch-up batches.

Use conservative production defaults such as 100 jobs and 10 batches, then tune from safe count
metrics. Overdue jobs are eligible because processors query persisted `due_at <= asOf`. If every
batch remains full, the task result reports `exhausted: true`; schedule another run instead of
removing the ceiling.

## Telemetry and alerts

Telemetry may contain only category, registered task name, batch number, outcome, processed and
failed counts, duration, and a predefined uppercase safe error code. Never add job payloads,
business keys, account/customer identifiers, point amounts, email, CURP, partner payloads,
credentials, or exception messages.

Alert when:

- a task reports `failed: true`;
- a task repeatedly reports `exhausted: true`;
- failed-job count grows between runs;
- no successful run is observed within the deployment's approved cadence.

## Recovery after downtime

1. Confirm database connectivity and the affected processor dependency.
2. Run with the current recovery `asOf`, normal batch size, and a conservative batch ceiling.
3. Repeat while `exhausted: true`; do not edit `due_at` or business keys.
4. Inspect the authorized failed-job view, which excludes payloads.
5. For a recoverable `FAILED` job, use the audited manual retry command with permission
   `rewards:jobs:retry`, a unique idempotency key, reason, and explanation.
6. Reconcile the domain result (award, balance, notification delivery, inventory, or report) from
   authoritative records before closing the incident.

## Rollback and shutdown

Stop new scheduler invocations first. In-flight processors finish their own database transaction.
Do not delete job/execution history or undo successful work. Disable the affected registered task,
fix forward, and resume catch-up using persisted due times.
