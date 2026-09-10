import { loadConfig } from "../../config.js";
import { createDatabase } from "../../database/connection.js";
import { SystemClock } from "../shared/clock.js";
import { BondaHttpGateway } from "./http-gateway.js";
import {
  PostgresBondaCatalogReconciliationSource,
  ReconcileBondaCatalog,
} from "./reconciliation.js";

const config = loadConfig();
if (!config.databaseUrl) throw new Error("DATABASE_URL is required");
if (!config.bonda) throw new Error("Bonda configuration is unavailable");
const affiliateCode = option("--affiliate-code");
if (!affiliateCode) throw new Error("--affiliate-code is required");

const database = createDatabase(config.databaseUrl);
try {
  const report = await new ReconcileBondaCatalog(
    new PostgresBondaCatalogReconciliationSource(database),
    new BondaHttpGateway(config.bonda),
    new SystemClock(),
  ).run(affiliateCode);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await database.end();
}

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  return value || null;
}
