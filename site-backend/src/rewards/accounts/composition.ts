import type { Pool } from "pg";
import type { BondaConfig } from "../../config.js";

import { SystemClock } from "../shared/clock.js";
import { PostgresRewardsEligibilityQuery } from "./eligibility.js";
import { PostgresPointIssuance } from "../ledger/issuance.js";
import { PostgresBehaviorRuleLookup } from "../behaviors/rule-lookup.js";
import {
  IngestQualifyingSiteAction,
  PostgresMonthlyInteractionStore,
} from "../behaviors/monthly-interaction.js";
import {
  PostgresOnboardingEvidenceStore,
  RecordOnboardingEvidence,
} from "../behaviors/onboarding.js";
import {
  DefaultRewardsBehaviorHttpApplication,
  type RewardsBehaviorHttpApplication,
} from "../behaviors/http-application.js";
import { AttributeReferral, PostgresReferralAttributions } from "../referrals/attribution.js";
import {
  DefaultReferralHttpApplication,
  PostgresReferralCustomerExperience,
  type ReferralHttpApplication,
} from "../referrals/http-application.js";
import {
  ConfirmReferralRegistration,
  PostgresReferralRegistrationAwards,
} from "../referrals/registration-award.js";
import { PostgresRewardsV2RuleLookup } from "../v2/configuration.js";
import {
  DefaultRewardsV2JourneyHttpApplication,
  type RewardsV2JourneyHttpApplication,
} from "../v2/journey-http-application.js";
import { PostgresRewardsJourneySummaryQuery } from "../v2/journey-summary.js";
import { PostgresRewardsV2LiveJourney } from "../v2/live-journey.js";
import { PostgresRewardsJourneyDetailsQuery } from "../v2/journey-details.js";
import {
  DefaultRewardsCustomerPortalApplication,
  PostgresRewardsCustomerPortalStore,
  type RewardsCustomerPortalApplication,
} from "../v2/customer-portal.js";
import { BondaAffiliateProvisioningApplication } from "../bonda/affiliate-provisioning.js";
import {
  BondaCouponApplication,
  PostgresBondaCouponJourneyQuery,
  PostgresBondaCouponPolicyQuery,
} from "../bonda/catalog-application.js";
import { BondaHttpGateway } from "../bonda/http-gateway.js";
import { FakeBondaGateway, localPreviewBondaCoupons } from "../bonda/fake-gateway.js";
import { BondaCatalogCache } from "../bonda/catalog-cache.js";
import {
  PostgresBondaAffiliateProvisioning,
  PostgresBondaCouponRequests,
} from "../bonda/persistence.js";

export function createRewardsBehaviorHttpApplication(
  database: Pool,
): RewardsBehaviorHttpApplication {
  const clock = new SystemClock();
  const issuance = new PostgresPointIssuance(database);
  const eligibility = new PostgresRewardsEligibilityQuery(database);
  return new DefaultRewardsBehaviorHttpApplication(
    database,
    {
      isEligible: async (customerId) => (await eligibility.getForAuthenticatedCustomer(customerId)).eligible,
    },
    new IngestQualifyingSiteAction(
      new PostgresBehaviorRuleLookup(database),
      new PostgresMonthlyInteractionStore(database),
      issuance,
      clock,
    ),
    new RecordOnboardingEvidence(
      new PostgresOnboardingEvidenceStore(database),
      issuance,
      clock,
    ),
    clock,
  );
}

export function createReferralHttpApplication(
  database: Pool,
  identityHmacSecret: string,
): ReferralHttpApplication {
  const clock = new SystemClock();
  return new DefaultReferralHttpApplication(
    new PostgresReferralCustomerExperience(database),
    new AttributeReferral(new PostgresReferralAttributions(database), clock),
    new ConfirmReferralRegistration(
      new PostgresReferralRegistrationAwards(database, new PostgresPointIssuance(database)),
      clock,
    ),
    clock,
    identityHmacSecret,
  );
}

export function createRewardsV2JourneyHttpApplication(
  database: Pool,
): RewardsV2JourneyHttpApplication {
  const clock = new SystemClock();
  return new DefaultRewardsV2JourneyHttpApplication(
    new PostgresRewardsJourneySummaryQuery(
      database,
      new PostgresRewardsV2RuleLookup(database),
      clock,
    ),
    new PostgresRewardsV2LiveJourney(database, clock),
    new PostgresRewardsJourneyDetailsQuery(database),
  );
}

export function createRewardsCustomerPortalApplication(
  database: Pool,
): RewardsCustomerPortalApplication {
  const clock = new SystemClock();
  const details = new PostgresRewardsJourneyDetailsQuery(database);
  return new DefaultRewardsCustomerPortalApplication(
    new PostgresRewardsJourneySummaryQuery(
      database,
      new PostgresRewardsV2RuleLookup(database),
      clock,
    ),
    details,
    new PostgresRewardsCustomerPortalStore(database),
    clock,
  );
}

export function createBondaIntegrations(database: Pool, config: BondaConfig): {
  affiliateProvisioning: BondaAffiliateProvisioningApplication;
  coupons: BondaCouponApplication;
  warmCatalog(): Promise<void>;
} {
  const clock = new SystemClock();
  const gateway = config.localPreviewEnabled
    ? new FakeBondaGateway({ coupons: localPreviewBondaCoupons() })
    : new BondaHttpGateway(config);
  const affiliateProvisioning = new BondaAffiliateProvisioningApplication(
    config.affiliateProvisioningEnabled || config.localPreviewEnabled === true,
    new PostgresBondaAffiliateProvisioning(database),
    gateway,
    clock,
  );
  const catalog = new BondaCatalogCache(
    gateway,
    clock,
    config.catalogCacheTtlMs,
    config.catalogCacheMaxStaleMs,
  );
  const policies = new PostgresBondaCouponPolicyQuery(database);
  const rules = new PostgresRewardsV2RuleLookup(database);
  return {
    affiliateProvisioning,
    coupons: new BondaCouponApplication(
      gateway,
      policies,
      new PostgresBondaCouponJourneyQuery(database),
      affiliateProvisioning,
      new PostgresBondaCouponRequests(database),
      rules,
      clock,
      undefined,
      catalog,
      config.catalogAffiliateCode,
    ),
    warmCatalog: async () => {
      if (!config.catalogEnabled || !config.catalogAffiliateCode) return;
      const now = clock.now();
      const feature = await rules.findEffective("V2_BONDA_COUPONS", now);
      if (!feature?.enabled || !feature.approvedForProduction) return;
      const approvedPolicies = await policies.listEffective(now);
      if (approvedPolicies.length === 0) return;
      await catalog.read(
        config.catalogAffiliateCode,
        approvedPolicies.map((policy) => policy.bondaCouponId),
      );
    },
  };
}
