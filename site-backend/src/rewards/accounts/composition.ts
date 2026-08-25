import type { Pool } from "pg";

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
