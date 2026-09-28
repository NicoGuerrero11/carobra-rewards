import { loadConfig } from "../../config.js";
import { createDatabase } from "../../database/connection.js";
import { createBondaIntegrations } from "../accounts/composition.js";
import { BackfillBondaAffiliates, PostgresBondaBackfillSource } from "./affiliate-operations.js";

const config = loadConfig();
if (!config.databaseUrl) throw new Error("DATABASE_URL is required");
if (!config.bonda) throw new Error("Bonda configuration is unavailable");
const mode = option("--mode") ?? "retry";
const limit = Number(option("--limit") ?? "25");
const apply = process.argv.includes("--apply");
const database = createDatabase(config.databaseUrl);

try {
  const integrations = createBondaIntegrations(database, config.bonda);
  const result = mode === "retry"
    ? apply
      ? await integrations.affiliateProvisioning.retryDue(limit)
      : { attempted: 0, active: 0, pending: 0, actionRequired: 0 }
    : mode === "backfill"
      ? await new BackfillBondaAffiliates(
        new PostgresBondaBackfillSource(database),
        integrations.affiliateProvisioning,
      ).run({ limit, apply })
      : null;
  if (!result) throw new Error("--mode must be retry or backfill");
  process.stdout.write(`${JSON.stringify({ mode, apply, ...result })}\n`);
} finally {
  await database.end();
}

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  return value || null;
}
