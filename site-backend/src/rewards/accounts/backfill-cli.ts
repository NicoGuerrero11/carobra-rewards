import { BackfillRewardsAccounts, PostgresRewardsBackfillCandidateQuery } from "./backfill.js";
import { ActivateRewardsAccount, PostgresRewardsAccountActivation } from "./activation.js";
import { createDatabase } from "../../database/connection.js";
import { SystemClock } from "../shared/clock.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const dryRun = process.argv.includes("--dry-run");
const batchSizeArgument = process.argv.find((argument) => argument.startsWith("--batch-size="));
const batchSize = batchSizeArgument
  ? Number(batchSizeArgument.slice("--batch-size=".length))
  : 100;
const database = createDatabase(databaseUrl);

try {
  const backfill = new BackfillRewardsAccounts(
    new PostgresRewardsBackfillCandidateQuery(database),
    new ActivateRewardsAccount(
      new PostgresRewardsAccountActivation(database),
      new SystemClock(),
    ),
  );
  const result = await backfill.execute({ dryRun, batchSize });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.failures.length > 0) process.exitCode = 1;
} finally {
  await database.end();
}
