import { createSiteBackendServer } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./database/connection.js";
import {
  createRewardsAccountHttpApplication,
  createRewardsBehaviorHttpApplication,
  createReferralHttpApplication,
  createRewardsV2JourneyHttpApplication,
} from "./rewards/accounts/composition.js";

const config = loadConfig();
const database = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
const server = createSiteBackendServer(
  config,
  undefined,
  database ? createRewardsAccountHttpApplication(database) : undefined,
  database ? createRewardsBehaviorHttpApplication(database) : undefined,
  database && config.referralIdentityHmacSecret
    ? createReferralHttpApplication(database, config.referralIdentityHmacSecret)
    : undefined,
  database ? createRewardsV2JourneyHttpApplication(database) : undefined,
);
if (database) {
  server.on("close", () => void database.end());
}

server.listen(config.port, config.host, () => {
  const address = server.address();
  if (address && typeof address !== "string") {
    console.log(`Site backend listening on http://${config.host}:${address.port}`);
  }
});
