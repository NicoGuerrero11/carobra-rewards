import { createSiteBackendServer } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./database/connection.js";
import {
  createRewardsBehaviorHttpApplication,
  createReferralHttpApplication,
  createRewardsV2JourneyHttpApplication,
  createRewardsCustomerPortalApplication,
  createBondaIntegrations,
} from "./rewards/accounts/composition.js";

const config = loadConfig();
const database = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
const bonda = database && config.bonda
  ? createBondaIntegrations(database, config.bonda)
  : undefined;
const server = createSiteBackendServer(
  config,
  undefined,
  database ? createRewardsBehaviorHttpApplication(database) : undefined,
  database && config.referralIdentityHmacSecret
    ? createReferralHttpApplication(database, config.referralIdentityHmacSecret)
    : undefined,
  database ? createRewardsV2JourneyHttpApplication(database) : undefined,
  database ? createRewardsCustomerPortalApplication(database) : undefined,
  bonda?.affiliateProvisioning,
  bonda?.coupons,
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
