import { createHash } from "node:crypto";

import type { RewardsProductFactStatus } from "../shared/enums.js";
import type {
  ProductFactRepository,
  RecordProductFactCommand,
  RecordProductFactResult,
} from "./product-facts.js";
import type {
  RecalculateRewardsLevelCommand,
  RecalculateRewardsLevelResult,
} from "./recalculate-level.js";

export interface ProductLevelRecalculation {
  execute(command: RecalculateRewardsLevelCommand): Promise<RecalculateRewardsLevelResult>;
}

export interface ProductLifecycleResult extends RecordProductFactResult {
  levelRecalculation: RecalculateRewardsLevelResult | null;
}

const levelRelevantStatuses = new Set<RewardsProductFactStatus>([
  "ACTIVE",
  "CANCELLED",
  "ENDED",
]);

export class RecordProductFactWithLevelRecalculation {
  constructor(
    private readonly productFacts: ProductFactRepository,
    private readonly levelRecalculation: ProductLevelRecalculation,
  ) {}

  async execute(
    command: RecordProductFactCommand & { redemptionFeatureEnabled: boolean },
  ): Promise<ProductLifecycleResult> {
    const recorded = await this.productFacts.record(command);
    if (!recorded.eventCreated || !levelRelevantStatuses.has(recorded.fact.status)) {
      return { ...recorded, levelRecalculation: null };
    }
    const levelRecalculation = await this.levelRecalculation.execute({
      customerId: recorded.fact.customerId,
      triggerType: "PRODUCT_FACT",
      triggerId: productFactTriggerId(command.source, command.sourceId),
      redemptionFeatureEnabled: command.redemptionFeatureEnabled,
    });
    return { ...recorded, levelRecalculation };
  }
}

function productFactTriggerId(source: string, sourceId: string): string {
  return createHash("sha256")
    .update(source.trim().toUpperCase())
    .update("\0")
    .update(sourceId.trim())
    .digest("hex");
}
