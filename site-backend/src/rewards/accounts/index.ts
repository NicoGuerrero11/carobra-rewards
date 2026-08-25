/** Rewards eligibility, activation, and account summary boundary. */
export const rewardsAccountsBoundary = "rewards-accounts" as const;

export {
  PostgresRewardsEligibilityQuery,
  type RewardsEligibility,
  type RewardsEligibilityQuery,
  type RewardsIneligibilityReason,
} from "./eligibility.js";
export {
  ActivateRewardsAccount,
  PostgresRewardsAccountActivation,
  type ActivateValidatedCustomerCommand,
  type RewardsAccountActivationPort,
  type RewardsActivationResult,
} from "./activation.js";
export {
  ObserveValidatedRewardsEvidence,
  type ObserveRewardsEvidenceResult,
  type RewardsActivationUseCase,
} from "./observe-validated-evidence.js";
export {
  BackfillRewardsAccounts,
  PostgresRewardsBackfillCandidateQuery,
  type RewardsBackfillCandidate,
  type RewardsBackfillCandidateQuery,
  type RewardsBackfillOptions,
  type RewardsBackfillResult,
} from "./backfill.js";
export {
  DefaultRewardsAccountHttpApplication,
  type RewardsAccountHttpApplication,
  type RewardsAccountSummaryHttpResponse,
  type RewardsEligibilityHttpResponse,
} from "./http-application.js";
export {
  PostgresRewardsAccountSummaryQuery,
  type RewardsAccountSummary,
  type RewardsAccountSummaryQuery,
  type RewardsBenefitAvailabilitySummary,
  type RewardsEarningOpportunitySummary,
  type RewardsMovementSummary,
} from "./summary.js";
export { createRewardsAccountHttpApplication } from "./composition.js";
