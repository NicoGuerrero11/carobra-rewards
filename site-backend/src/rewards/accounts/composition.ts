import type { Pool } from "pg";

import { SystemClock } from "../shared/clock.js";
import { ActivateRewardsAccount, PostgresRewardsAccountActivation } from "./activation.js";
import {
  DefaultRewardsAccountHttpApplication,
  type RewardsAccountHttpApplication,
} from "./http-application.js";
import { PostgresRewardsEligibilityQuery } from "./eligibility.js";
import { ObserveValidatedRewardsEvidence } from "./observe-validated-evidence.js";
import { PostgresRewardsAccountSummaryQuery } from "./summary.js";
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

export function createRewardsAccountHttpApplication(
  database: Pool,
): RewardsAccountHttpApplication {
  const clock = new SystemClock();
  const observation = new ObserveValidatedRewardsEvidence(
    new PostgresRewardsEligibilityQuery(database),
    new ActivateRewardsAccount(
      new PostgresRewardsAccountActivation(database),
      clock,
    ),
  );
  return new DefaultRewardsAccountHttpApplication(
    observation,
    new PostgresRewardsAccountSummaryQuery(database, clock),
  );
}

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
