import assert from "node:assert/strict";
import test from "node:test";

import {
  OperateRewardsJobs,
  type RewardsJobOperationsPort,
  type RetryFailedJobCommand,
} from "../src/rewards/operations/job-operations.js";
import { FixedClock } from "../src/rewards/shared/clock.js";

const requestedAt = new Date("2026-07-14T18:00:00.000Z");
const command: RetryFailedJobCommand = {
  jobId: "00000000-0000-4000-8000-000000009301",
  idempotencyKey: "manual-retry:job-9301",
  reasonCode: "DEPENDENCY_RECOVERED",
  explanation: "The configured dependency is healthy again.",
};

test("job operations enforce separate view and retry permissions", () => {
  const port = new CapturingJobOperations();
  const operations = new OperateRewardsJobs(port, new FixedClock(requestedAt));
  assert.throws(() => operations.listFailed({
      id: "retry-only",
      permissions: ["rewards:jobs:retry"],
    }, 10),
  hasForbiddenCode);
  assert.throws(() => operations.retry({
      id: "viewer",
      permissions: ["rewards:jobs:view"],
    }, command),
  hasForbiddenCode);
  assert.equal(port.retryCommand, null);
});

test("authorized manual retry carries immutable audit context and application time", async () => {
  const port = new CapturingJobOperations();
  const operations = new OperateRewardsJobs(port, new FixedClock(requestedAt));
  assert.deepEqual(await operations.retry({
    id: "operations-1",
    permissions: ["rewards:jobs:retry"],
  }, command), {
    jobId: command.jobId,
    status: "PENDING",
    replayed: false,
  });
  assert.deepEqual(port.retryCommand, {
    ...command,
    actorId: "operations-1",
    requestedAt,
  });
});

test("failed-job views are bounded before reaching persistence", () => {
  const port = new CapturingJobOperations();
  const operations = new OperateRewardsJobs(port, new FixedClock(requestedAt));
  assert.throws(() => operations.listFailed({
    id: "viewer",
    permissions: ["rewards:jobs:view"],
  }, 101), /between 1 and 100/);
  assert.equal(port.listLimit, null);
});

test("manual retry audit rejects credentials and customer identity", () => {
  const operations = new OperateRewardsJobs(
    new CapturingJobOperations(),
    new FixedClock(requestedAt),
  );
  assert.throws(() => operations.retry({
    id: "operations-1",
    permissions: ["rewards:jobs:retry"],
  }, { ...command, explanation: "token=secret-value" }), /credential-sensitive/);
  assert.throws(() => operations.retry({
    id: "operations-1",
    permissions: ["rewards:jobs:retry"],
  }, { ...command, explanation: "Customer ABCD123456HMNLRS09 requested it" }), /customer-sensitive/);
});

class CapturingJobOperations implements RewardsJobOperationsPort {
  retryCommand: Parameters<RewardsJobOperationsPort["retry"]>[0] | null = null;
  listLimit: number | null = null;

  async listFailed(limit: number) {
    this.listLimit = limit;
    return [];
  }

  async retry(captured: Parameters<RewardsJobOperationsPort["retry"]>[0]) {
    this.retryCommand = captured;
    return { jobId: captured.jobId, status: "PENDING" as const, replayed: false };
  }
}

function hasForbiddenCode(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && error.code === "forbidden";
}
