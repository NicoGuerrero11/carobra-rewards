import { loadConfig } from "../../config.js";
import { createDatabase } from "../../database/connection.js";
import { createBondaAffiliateProfileRuntime } from "./affiliate-profile-worker.js";

// Explicit local operations only. This module is never imported by server startup.
const mode = option("--mode") ?? "process";
const apply = process.argv.includes("--apply");
if (!apply) {
  process.stdout.write(JSON.stringify({ mode, status: "DRY_RUN", processedJobs: 0 }) + "\n");
} else {
  const config = loadConfig();
  if (!config.bonda) throw new Error("Bonda configuration unavailable");
  if ((mode === "process" || mode === "enqueue") && !config.bonda.profileSync?.enabled) {
    process.stdout.write(JSON.stringify({ mode, status: "DISABLED", processedJobs: 0 }) + "\n");
  } else {
    if (!config.databaseUrl) throw new Error("DATABASE_URL is required");
    const database = createDatabase(config.databaseUrl);
    try {
      const runtime = createBondaAffiliateProfileRuntime(database, config.bonda);
      if (mode === "process") {
        const result = await runtime.worker.processDue(new Date(), Number(option("--limit") ?? 25), "bonda-profile-cli");
        process.stdout.write(JSON.stringify({ mode, ...result }) + "\n");
      } else if (mode === "enqueue") {
        const result = await runtime.worker.enqueueExisting(Number(option("--limit") ?? 25), option("--after-customer-id") ?? null);
        process.stdout.write(JSON.stringify({ mode, ...result }) + "\n");
      } else if (mode === "inspect") {
        const customerId = required("--customer-id");
        const checkpoint = await runtime.store.read(customerId);
        process.stdout.write(JSON.stringify({ mode, status: checkpoint?.status ?? "NOT_STARTED", operationId: checkpoint?.operationId ?? null }) + "\n");
      } else if (mode === "reconcile") {
        const outcome = required("--outcome");
        if (outcome !== "APPLIED" && outcome !== "NOT_APPLIED") throw new Error("Invalid reconciliation outcome");
        const result = await runtime.store.reconcile({
          customerId: required("--customer-id"), operationId: required("--operation-id"), outcome,
          evidenceReference: required("--evidence-ref"), reviewerId: required("--reviewer-id"), apply,
        });
        process.stdout.write(JSON.stringify({ mode, status: result }) + "\n");
      } else throw new Error("Mode must be process, enqueue, inspect or reconcile");
    } catch {
      // Database errors may include query parameters; never print them.
      process.stderr.write("Bonda profile operation failed; inspect the local checkpoint through authorized operations.\n");
      process.exitCode = 1;
    } finally { await database.end(); }
  }
}
function option(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
function required(name: string) {
  const value = option(name)?.trim();
  if (!value || value.startsWith("--")) throw new Error(`Required option ${name}`);
  return value;
}
