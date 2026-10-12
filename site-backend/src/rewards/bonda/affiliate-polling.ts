import type { DueJobProcessor, SchedulerBatchResult } from "../operations/scheduler-runner.js";

type Schedule = (callback: () => void, delayMs: number) => () => void;
const scheduleTimer: Schedule = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  timer.unref();
  return () => clearTimeout(timer);
};

/** Runs only future captured affiliation events; no backfill, points or profiles. */
export function startBondaAffiliatePolling(
  processor: DueJobProcessor,
  enabled: boolean,
  report: (result: SchedulerBatchResult | { error: "AFFILIATION_EVENT_BATCH_FAILED" }) => void,
  schedule: Schedule = scheduleTimer,
): { stop(): Promise<void> } {
  let stopped = !enabled;
  let cancel: (() => void) | undefined;
  let pending: Promise<void> = Promise.resolve();
  const tick = async () => {
    if (stopped) return;
    try {
      report(await processor.processDue(new Date(), 25, "bonda-affiliate-runtime"));
    } catch { report({ error: "AFFILIATION_EVENT_BATCH_FAILED" }); }
    finally {
      // Delay starts after completion, so slow providers never overlap batches.
      if (!stopped) cancel = schedule(() => { pending = tick(); }, 60_000);
    }
  };
  if (enabled) pending = tick();
  return { stop: async () => { stopped = true; cancel?.(); await pending; } };
}
