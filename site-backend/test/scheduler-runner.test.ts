import assert from "node:assert/strict";
import test from "node:test";

import {
  BoundedSchedulerRunner,
  dueJobTask,
  schedulerCategories,
  type SchedulerBatchResult,
  type SchedulerTelemetryEvent,
} from "../src/rewards/operations/scheduler-runner.js";

const asOf = new Date("2027-12-15T12:00:00.000Z");

test("scheduler runner catches up overdue work in bounded batches", async () => {
  const telemetry: SchedulerTelemetryEvent[] = [];
  const processor = new SequencedProcessor([
    { processedJobs: 2, failedJobs: 0 },
    { processedJobs: 2, failedJobs: 1 },
    { processedJobs: 1, failedJobs: 0 },
  ]);
  const runner = new BoundedSchedulerRunner([
    dueJobTask("awards", "birthday-awards", processor, "BIRTHDAY_AWARDS_FAILED"),
  ], { record: (event) => telemetry.push(event) }, sequenceClock());
  assert.deepEqual(await runner.run({
    asOf,
    workerId: "scheduler-1",
    batchSize: 2,
    maxBatchesPerTask: 5,
  }), {
    asOf,
    tasks: [{
      category: "awards",
      taskName: "birthday-awards",
      batches: 3,
      processedJobs: 5,
      failedJobs: 1,
      exhausted: false,
      failed: false,
    }],
  });
  assert.equal(processor.calls, 3);
  assert.deepEqual(telemetry.map((event) => event.processedJobs), [2, 2, 1]);
});

test("scheduler runner stops catch-up at the configured batch ceiling", async () => {
  const processor = new SequencedProcessor([
    { processedJobs: 2 },
    { processedJobs: 2 },
    { processedJobs: 1 },
  ]);
  const runner = new BoundedSchedulerRunner([
    dueJobTask("expiration", "point-expiration", processor, "POINT_EXPIRATION_FAILED"),
  ], { record: () => undefined });
  const result = await runner.run({
    asOf,
    workerId: "scheduler-2",
    batchSize: 2,
    maxBatchesPerTask: 2,
  });
  assert.equal(processor.calls, 2);
  assert.equal(result.tasks[0]?.exhausted, true);
  assert.equal(result.tasks[0]?.processedJobs, 4);
});

test("scheduler telemetry replaces raw failures with configured safe codes", async () => {
  const telemetry: SchedulerTelemetryEvent[] = [];
  const rawFailure = "customer@example.com has 120000 points; token=secret";
  const runner = new BoundedSchedulerRunner([
    dueJobTask("notification", "expiration-notices", {
      processDue: async () => { throw new Error(rawFailure); },
    }, "EXPIRATION_NOTICE_FAILED"),
  ], { record: (event) => telemetry.push(event) }, () => 0);
  const result = await runner.run({
    asOf,
    workerId: "scheduler-3",
    batchSize: 10,
    maxBatchesPerTask: 3,
  });
  assert.equal(result.tasks[0]?.failed, true);
  assert.deepEqual(telemetry[0], {
    category: "notification",
    taskName: "expiration-notices",
    batchNumber: 1,
    outcome: "FAILED",
    processedJobs: 0,
    failedJobs: 1,
    durationMs: 0,
    safeErrorCode: "EXPIRATION_NOTICE_FAILED",
  });
  assert.doesNotMatch(JSON.stringify({ result, telemetry }), /customer@|120000|secret/);
});

test("a failed task does not block recovery work in later categories", async () => {
  const recovery = new SequencedProcessor([{ processedJobs: 1 }]);
  const result = await new BoundedSchedulerRunner([
    dueJobTask("awards", "failed-award", {
      processDue: async () => { throw new Error("unsafe processor detail"); },
    }, "AWARD_TASK_FAILED"),
    dueJobTask("expiration", "expiration-recovery", recovery, "EXPIRATION_TASK_FAILED"),
  ], { record: () => undefined }).run({
    asOf,
    workerId: "scheduler-recovery",
    batchSize: 10,
    maxBatchesPerTask: 2,
  });

  assert.equal(result.tasks[0]?.failed, true);
  assert.equal(result.tasks[1]?.processedJobs, 1);
  assert.equal(recovery.calls, 1);
});

test("all operational categories use the same bounded runner contract", async () => {
  const tasks = schedulerCategories.map((category) => dueJobTask(
    category,
    `${category}-task`,
    new SequencedProcessor([{ processedJobs: 0 }]),
    `${category.toUpperCase()}_TASK_FAILED`,
  ));
  const result = await new BoundedSchedulerRunner(
    tasks,
    { record: () => undefined },
  ).run({ asOf, workerId: "scheduler-all", batchSize: 25, maxBatchesPerTask: 4 });
  assert.deepEqual(result.tasks.map((task) => task.category), schedulerCategories);
  assert.ok(result.tasks.every((task) => task.batches === 1 && !task.exhausted));
});

class SequencedProcessor {
  calls = 0;
  constructor(private readonly results: readonly SchedulerBatchResult[]) {}

  async processDue(): Promise<SchedulerBatchResult> {
    const result = this.results[this.calls] ?? { processedJobs: 0 };
    this.calls += 1;
    return result;
  }
}

function sequenceClock(): () => number {
  let value = 0;
  return () => value++;
}
