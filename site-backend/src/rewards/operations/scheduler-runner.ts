export const schedulerCategories = [
  "awards",
  "expiration",
  "notification",
  "inventory",
  "reporting",
] as const;

export type SchedulerCategory = (typeof schedulerCategories)[number];

export interface SchedulerBatchResult {
  processedJobs: number;
  failedJobs?: number;
}

export interface DueJobProcessor {
  processDue(
    asOf: Date,
    batchSize: number,
    workerId: string,
  ): Promise<SchedulerBatchResult>;
}

export interface SchedulerTask {
  category: SchedulerCategory;
  name: string;
  safeFailureCode: string;
  runBatch(asOf: Date, batchSize: number, workerId: string): Promise<SchedulerBatchResult>;
}

export interface SchedulerTelemetryEvent {
  category: SchedulerCategory;
  taskName: string;
  batchNumber: number;
  outcome: "SUCCEEDED" | "FAILED";
  processedJobs: number;
  failedJobs: number;
  durationMs: number;
  safeErrorCode: string | null;
}

export interface SchedulerTelemetryPort {
  record(event: SchedulerTelemetryEvent): void;
}

export interface SchedulerRunCommand {
  asOf: Date;
  workerId: string;
  batchSize: number;
  maxBatchesPerTask: number;
}

export interface SchedulerTaskRunResult {
  category: SchedulerCategory;
  taskName: string;
  batches: number;
  processedJobs: number;
  failedJobs: number;
  exhausted: boolean;
  failed: boolean;
}

export interface SchedulerRunResult {
  asOf: Date;
  tasks: readonly SchedulerTaskRunResult[];
}

export class BoundedSchedulerRunner {
  constructor(
    private readonly tasks: readonly SchedulerTask[],
    private readonly telemetry: SchedulerTelemetryPort,
    private readonly monotonicNow: () => number = Date.now,
  ) {
    validateTasks(tasks);
  }

  async run(command: SchedulerRunCommand): Promise<SchedulerRunResult> {
    validateCommand(command);
    const results: SchedulerTaskRunResult[] = [];
    for (const task of this.tasks) {
      let batches = 0;
      let processedJobs = 0;
      let failedJobs = 0;
      let failed = false;
      let lastBatchWasFull = false;
      while (batches < command.maxBatchesPerTask) {
        batches += 1;
        const startedAt = this.monotonicNow();
        try {
          const batch = await task.runBatch(
            new Date(command.asOf),
            command.batchSize,
            command.workerId,
          );
          validateBatchResult(batch, command.batchSize);
          const batchFailedJobs = batch.failedJobs ?? 0;
          processedJobs += batch.processedJobs;
          failedJobs += batchFailedJobs;
          lastBatchWasFull = batch.processedJobs === command.batchSize;
          this.telemetry.record({
            category: task.category,
            taskName: task.name,
            batchNumber: batches,
            outcome: "SUCCEEDED",
            processedJobs: batch.processedJobs,
            failedJobs: batchFailedJobs,
            durationMs: elapsedMs(startedAt, this.monotonicNow()),
            safeErrorCode: null,
          });
          if (!lastBatchWasFull) break;
        } catch {
          failed = true;
          lastBatchWasFull = false;
          this.telemetry.record({
            category: task.category,
            taskName: task.name,
            batchNumber: batches,
            outcome: "FAILED",
            processedJobs: 0,
            failedJobs: 1,
            durationMs: elapsedMs(startedAt, this.monotonicNow()),
            safeErrorCode: task.safeFailureCode,
          });
          break;
        }
      }
      results.push({
        category: task.category,
        taskName: task.name,
        batches,
        processedJobs,
        failedJobs,
        exhausted: !failed && lastBatchWasFull && batches === command.maxBatchesPerTask,
        failed,
      });
    }
    return { asOf: new Date(command.asOf), tasks: results };
  }
}

export function dueJobTask(
  category: SchedulerCategory,
  name: string,
  processor: DueJobProcessor,
  safeFailureCode: string,
): SchedulerTask {
  return {
    category,
    name,
    safeFailureCode,
    runBatch: (asOf, batchSize, workerId) => (
      processor.processDue(asOf, batchSize, workerId)
    ),
  };
}

function validateTasks(tasks: readonly SchedulerTask[]): void {
  if (tasks.length < 1 || tasks.length > 50) {
    throw new Error("Scheduler runner requires between 1 and 50 tasks");
  }
  const names = new Set<string>();
  for (const task of tasks) {
    if (!schedulerCategories.includes(task.category)
      || !/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(task.name)
      || !/^[A-Z0-9_]{1,80}$/.test(task.safeFailureCode)) {
      throw new Error("Scheduler task metadata is invalid");
    }
    if (names.has(task.name)) throw new Error("Scheduler task names must be unique");
    names.add(task.name);
  }
}

function validateCommand(command: SchedulerRunCommand): void {
  if (Number.isNaN(command.asOf.getTime())
    || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(command.workerId)
    || !Number.isInteger(command.batchSize)
    || command.batchSize < 1
    || command.batchSize > 1000
    || !Number.isInteger(command.maxBatchesPerTask)
    || command.maxBatchesPerTask < 1
    || command.maxBatchesPerTask > 100) {
    throw new Error("Scheduler run command is invalid or exceeds safe bounds");
  }
}

function validateBatchResult(result: SchedulerBatchResult, batchSize: number): void {
  const failedJobs = result.failedJobs ?? 0;
  if (!Number.isInteger(result.processedJobs)
    || result.processedJobs < 0
    || result.processedJobs > batchSize
    || !Number.isInteger(failedJobs)
    || failedJobs < 0
    || failedJobs > result.processedJobs) {
    throw new Error("Scheduler processor returned invalid bounded counts");
  }
}

function elapsedMs(startedAt: number, finishedAt: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return 0;
  return Math.max(0, Math.round(finishedAt - startedAt));
}
