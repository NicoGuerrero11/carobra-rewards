import { createDatabase } from "../../database/connection.js";
import {
  NormalizeTestCustomerBalancesToV2,
  PostgresTestBalanceAdjustment,
  PostgresTestBalanceCandidateQuery,
} from "./test-balance-normalization.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const apply = process.argv.includes("--apply");
const database = createDatabase(databaseUrl);

try {
  const normalization = new NormalizeTestCustomerBalancesToV2(
    new PostgresTestBalanceCandidateQuery(database),
    new PostgresTestBalanceAdjustment(database),
  );
  const result = await normalization.execute(!apply);
  process.stdout.write(`${JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    ...result,
    wouldRemovePoints: result.wouldRemovePoints.toString(),
    removedPoints: result.removedPoints.toString(),
  }, null, 2)}\n`);
  if (result.failures.length > 0) process.exitCode = 1;
} finally {
  await database.end();
}
