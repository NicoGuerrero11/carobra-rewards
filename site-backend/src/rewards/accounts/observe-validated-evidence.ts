import type { CustomerId } from "../shared/identifiers.js";
import type {
  ActivateValidatedCustomerCommand,
  RewardsActivationResult,
} from "./activation.js";
import type {
  RewardsEligibility,
  RewardsEligibilityQuery,
} from "./eligibility.js";

export interface RewardsActivationUseCase {
  execute(command: ActivateValidatedCustomerCommand): Promise<RewardsActivationResult>;
}

export type ObserveRewardsEvidenceResult =
  | {
      eligibility: RewardsEligibility;
      activation: null;
    }
  | {
      eligibility: RewardsEligibility & { eligible: true };
      activation: RewardsActivationResult;
    };

export class ObserveValidatedRewardsEvidence {
  constructor(
    private readonly eligibility: RewardsEligibilityQuery,
    private readonly activation: RewardsActivationUseCase,
  ) {}

  async execute(customerId: CustomerId): Promise<ObserveRewardsEvidenceResult> {
    const eligibility = await this.eligibility.getForAuthenticatedCustomer(customerId);
    if (!eligibility.eligible) return { eligibility, activation: null };
    if (!eligibility.validatedAt) {
      throw new Error("Eligible Rewards evidence must include validatedAt");
    }

    return {
      eligibility: { ...eligibility, eligible: true },
      activation: await this.activation.execute({
        customerId,
        validatedAt: eligibility.validatedAt,
      }),
    };
  }
}
