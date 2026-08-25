import { createDatabase } from "../../database/connection.js";
import { SystemClock } from "../shared/clock.js";
import { BackfillRewardsV2Journeys, PostgresRewardsV2BackfillCandidateQuery } from "./backfill.js";
import { PostgresRewardsV2LiveJourney } from "./live-journey.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const apply = process.argv.includes("--apply");
const batchSizeArgument = process.argv.find((argument) => argument.startsWith("--batch-size="));
const batchSize = batchSizeArgument
  ? Number(batchSizeArgument.slice("--batch-size=".length))
  : 100;
const database = createDatabase(databaseUrl);

try {
  const backfill = new BackfillRewardsV2Journeys(
    new PostgresRewardsV2BackfillCandidateQuery(database),
    new PostgresRewardsV2LiveJourney(database, new SystemClock()),
  );
  const result = await backfill.execute({ dryRun: !apply, batchSize });
  process.stdout.write(`${JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }, null, 2)}\n`);
  if (result.failures.length > 0) process.exitCode = 1;
} finally {
  await database.end();
}
