import type { CustomerId } from "../shared/identifiers.js";
import type {
  EnsureInvitedJourneyCommand,
  RewardsV2LiveJourneyPort,
  SynchronizeRewardsEvidenceCommand,
} from "./live-journey.js";
import type { RewardsJourneySummaryHttpResponse } from "./journey-summary-contract.js";
import type { RewardsJourneySummaryQuery } from "./journey-summary.js";
import type {
  PostgresRewardsJourneyDetailsQuery,
  RewardsActivityDetailsHttpResponse,
  RewardsMovementDetailsHttpResponse,
} from "./journey-details.js";

export interface RewardsV2JourneyHttpApplication {
  ensureInvited(command: EnsureInvitedJourneyCommand): Promise<void>;
  synchronize(command: SynchronizeRewardsEvidenceCommand): Promise<void>;
  getActivities(customerId: CustomerId): Promise<RewardsActivityDetailsHttpResponse>;
  getMovements(customerId: CustomerId): Promise<RewardsMovementDetailsHttpResponse>;
  getSummary(
    customerId: CustomerId,
    validationStatus: string,
  ): Promise<RewardsJourneySummaryHttpResponse | null>;
}

export class DefaultRewardsV2JourneyHttpApplication
implements RewardsV2JourneyHttpApplication {
  constructor(
    private readonly summaries: RewardsJourneySummaryQuery,
    private readonly liveJourney: RewardsV2LiveJourneyPort,
    private readonly details: PostgresRewardsJourneyDetailsQuery,
  ) {}

  ensureInvited(command: EnsureInvitedJourneyCommand): Promise<void> {
    return this.liveJourney.ensureInvited(command);
  }

  synchronize(command: SynchronizeRewardsEvidenceCommand): Promise<void> {
    return this.liveJourney.synchronize(command);
  }

  getActivities(customerId: CustomerId): Promise<RewardsActivityDetailsHttpResponse> {
    return this.details.getActivities(customerId);
  }

  getMovements(customerId: CustomerId): Promise<RewardsMovementDetailsHttpResponse> {
    return this.details.getMovements(customerId);
  }

  getSummary(
    customerId: CustomerId,
    validationStatus: string,
  ): Promise<RewardsJourneySummaryHttpResponse | null> {
    return this.summaries.getForCustomer(customerId, validationStatus);
  }
}
