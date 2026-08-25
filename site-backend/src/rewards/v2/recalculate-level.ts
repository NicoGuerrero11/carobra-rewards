import type { Clock } from "../shared/clock.js";
import type { RewardsLevel } from "../shared/enums.js";
import type { CustomerId } from "../shared/identifiers.js";
import type { RewardsV2RuleLookupPort, RewardsV2RuleVersion } from "./configuration.js";
import type { JourneyLevelStore } from "./level-decisions.js";
import {
  evaluateRewardsLevel,
  type ProductLevelThreshold,
  type RewardsLevelEvaluation,
  type SilverLevelRule,
} from "./level-engine.js";
import type { ProductFactRepository } from "./product-facts.js";
import type { ProfileActivityRepository } from "./profile-activities.js";
import { evaluateRedemptionAccess } from "./redemption-access.js";

export interface RecalculateRewardsLevelCommand {
  customerId: CustomerId;
  triggerType: string;
  triggerId: string;
  redemptionFeatureEnabled: boolean;
}

export type RecalculateRewardsLevelResult =
  | {
      status: "RULE_UNAVAILABLE";
      currentLevel: RewardsLevel | null;
      reason: string;
    }
  | {
      status: "DECIDED";
      evaluation: RewardsLevelEvaluation;
      replayed: boolean;
      redemptionEligible: boolean;
    };

export class RecalculateRewardsLevel {
  constructor(
    private readonly journeys: JourneyLevelStore,
    private readonly productFacts: ProductFactRepository,
    private readonly profileActivities: ProfileActivityRepository,
    private readonly rules: RewardsV2RuleLookupPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RecalculateRewardsLevelCommand,
  ): Promise<RecalculateRewardsLevelResult> {
    const effectiveAt = this.clock.now();
    const journey = await this.journeys.getForCustomer(command.customerId);
    if (!journey) throw new Error("Rewards V2 journey was not found");
    const precedence = await this.rules.findEffective("V2_LEVEL_PRECEDENCE", effectiveAt);
    if (!precedence?.enabled) {
      return {
        status: "RULE_UNAVAILABLE",
        currentLevel: journey.currentLevel,
        reason: precedence?.disabledReason ?? "The level precedence rule is unavailable.",
      };
    }

    const [facts, progress, silverRuleVersion] = await Promise.all([
      this.productFacts.listForCustomer(command.customerId),
      this.profileActivities.getProgress(command.customerId, journey.registeredAt),
      this.rules.findEffective("V2_SILVER_PROFILE_THRESHOLD", effectiveAt),
    ]);
    const activeProductCount = facts.filter(
      (fact) => fact.status === "ACTIVE"
        && fact.activatedAt !== null
        && fact.activatedAt <= effectiveAt,
    ).length;
    const silverRule = silverRuleVersion?.enabled
      ? parseSilverRule(silverRuleVersion)
      : null;
    const evaluation = evaluateRewardsLevel({
      currentLevel: journey.currentLevel,
      activeProductCount,
      registrationMonths: completedUtcMonths(journey.registeredAt, effectiveAt),
      qualifyingActivityCount: progress.qualifyingActivityCount,
      matrix: {
        productThresholds: parseProductThresholds(precedence),
        silver: silverRule,
      },
    });
    const redemption = evaluateRedemptionAccess({
      activeProductCount,
      redemptionFeatureEnabled: command.redemptionFeatureEnabled,
    });
    const decision = await this.journeys.applyDecision({
      journeyId: journey.id,
      ruleVersionId: precedence.id,
      resultingLevel: evaluation.resultingLevel,
      resultingState: activeProductCount > 0 ? "ACTIVE" : journey.state,
      redemptionEligible: redemption.eligible,
      triggerType: command.triggerType,
      triggerId: command.triggerId,
      decisionInputs: {
        ...evaluation.decisionInputs,
        precedenceRuleVersionId: precedence.id,
        silverRuleVersionId: silverRuleVersion?.enabled ? silverRuleVersion.id : null,
        silverRuleAvailable: silverRule !== null,
        redemptionFeatureEnabled: command.redemptionFeatureEnabled,
      },
      reasonCode: evaluation.reasonCode,
      idempotencyKey: [
        "v2-level",
        journey.id,
        command.triggerType,
        command.triggerId,
        precedence.id,
        silverRuleVersion?.enabled ? silverRuleVersion.id : "no-silver-rule",
      ].join(":"),
      decidedAt: effectiveAt,
    });
    return {
      status: "DECIDED",
      evaluation,
      replayed: decision.replayed,
      redemptionEligible: redemption.eligible,
    };
  }
}

export function completedUtcMonths(from: Date, to: Date): number {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    throw new Error("Registration permanence interval is invalid");
  }
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12
    + to.getUTCMonth() - from.getUTCMonth();
  const candidate = addUtcMonthsClamped(from, months);
  if (candidate > to) months -= 1;
  return Math.max(0, months);
}

function addUtcMonthsClamped(value: Date, months: number): Date {
  const target = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth() + months,
    1,
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
    value.getUTCMilliseconds(),
  ));
  const finalDay = new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  target.setUTCDate(Math.min(value.getUTCDate(), finalDay));
  return target;
}

function parseProductThresholds(rule: RewardsV2RuleVersion): readonly ProductLevelThreshold[] {
  const value = rule.settings.productThresholds;
  if (!Array.isArray(value)) {
    throw new Error("V2 level precedence configuration is incomplete");
  }
  return value.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("V2 product level threshold is invalid");
    }
    const level = "level" in item ? item.level : undefined;
    const minimum = "minimumActiveProducts" in item ? item.minimumActiveProducts : undefined;
    if ((level !== "BRONZE" && level !== "GOLD"
      && level !== "PLATINUM" && level !== "TITANIUM")
      || typeof minimum !== "number") {
      throw new Error("V2 product level threshold is invalid");
    }
    return { level, minimumActiveProducts: minimum };
  });
}

function parseSilverRule(rule: RewardsV2RuleVersion): SilverLevelRule {
  const months = rule.settings.minimumRegistrationMonths;
  const activities = rule.settings.minimumQualifyingActivities;
  if (typeof months !== "number" || typeof activities !== "number") {
    throw new Error("V2 Silver profile configuration is incomplete");
  }
  return {
    minimumRegistrationMonths: months,
    minimumQualifyingActivities: activities,
  };
}
