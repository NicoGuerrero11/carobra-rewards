import { createSiteBackendServer } from "./app.js";
import { loadConfig } from "./config.js";
import { CoursesApplication } from './rewards/courses/application.js';
import { BondaActivitiesGateway } from './rewards/courses/activities-gateway.js';
import {PostgresProgressStore} from './rewards/courses/progress.js';
import { PostgresBondaCouponJourneyQuery } from './rewards/bonda/catalog-application.js';
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
  database && config.bonda ? new CoursesApplication(
    new PostgresBondaCouponJourneyQuery(database),
    new BondaActivitiesGateway(config.bonda),
    config.bonda.coursesEnabled ?? false,
    undefined,
    undefined,
    new PostgresProgressStore(database),
  ) : undefined,
);
if (database) {
  server.on("close", () => void database.end());
  void database.query("SELECT 1")
    .then(async () => bonda?.warmCatalog())
    .catch((error: unknown) => {
      console.warn(JSON.stringify({
        event: "site_backend_warmup_failed",
        error_name: error instanceof Error ? error.name : "unknown",
      }));
    });
}

server.listen(config.port, config.host, () => {
  const address = server.address();
  if (address && typeof address !== "string") {
    console.log(`Site backend listening on http://${config.host}:${address.port}`);
  }
});
