import type { RewardsLevel } from "../shared/enums.js";

export interface ProductLevelThreshold {
  level: Exclude<RewardsLevel, "SILVER">;
  minimumActiveProducts: number;
}

export interface SilverLevelRule {
  minimumRegistrationMonths: number;
  minimumQualifyingActivities: number;
}

export interface RewardsLevelMatrix {
  productThresholds: readonly ProductLevelThreshold[];
  silver: SilverLevelRule | null;
}

export interface RewardsLevelEvaluationInput {
  currentLevel: RewardsLevel | null;
  activeProductCount: number;
  registrationMonths: number;
  qualifyingActivityCount: number;
  matrix: RewardsLevelMatrix;
}

export interface RewardsLevelProgress {
  targetLevel: RewardsLevel | null;
  ruleAvailable: boolean;
  remainingActiveProducts: number | null;
  remainingRegistrationMonths: number | null;
  remainingQualifyingActivities: number | null;
}

export interface RewardsLevelEvaluation {
  resultingLevel: RewardsLevel | null;
  changed: boolean;
  reasonCode: string;
  progress: RewardsLevelProgress;
  decisionInputs: Readonly<Record<string, unknown>>;
}

export function evaluateRewardsLevel(
  input: RewardsLevelEvaluationInput,
): RewardsLevelEvaluation {
  requireNonNegativeInteger("activeProductCount", input.activeProductCount);
  requireNonNegativeInteger("registrationMonths", input.registrationMonths);
  requireNonNegativeInteger("qualifyingActivityCount", input.qualifyingActivityCount);
  const thresholds = validateThresholds(input.matrix.productThresholds);
  validateSilver(input.matrix.silver);

  const productLevel = [...thresholds]
    .reverse()
    .find((threshold) => input.activeProductCount >= threshold.minimumActiveProducts)
    ?.level ?? null;
  let resultingLevel: RewardsLevel | null = productLevel;
  let reasonCode = productLevel === null ? "NO_ACTIVE_PRODUCTS" : "ACTIVE_PRODUCT_COUNT";

  if (productLevel === "BRONZE" && input.matrix.silver) {
    const silverEligible = input.registrationMonths
      >= input.matrix.silver.minimumRegistrationMonths
      && input.qualifyingActivityCount
      >= input.matrix.silver.minimumQualifyingActivities;
    if (silverEligible) {
      resultingLevel = "SILVER";
      reasonCode = "SILVER_PROFILE_ELIGIBLE";
    }
  }

  return {
    resultingLevel,
    changed: input.currentLevel !== resultingLevel,
    reasonCode,
    progress: nextProgress({ ...input, productLevel, resultingLevel, thresholds }),
    decisionInputs: {
      activeProductCount: input.activeProductCount,
      registrationMonths: input.registrationMonths,
      qualifyingActivityCount: input.qualifyingActivityCount,
    },
  };
}

function nextProgress(input: RewardsLevelEvaluationInput & {
  productLevel: Exclude<RewardsLevel, "SILVER"> | null;
  resultingLevel: RewardsLevel | null;
  thresholds: readonly ProductLevelThreshold[];
}): RewardsLevelProgress {
  if (input.resultingLevel === null) {
    const first = input.thresholds[0] ?? null;
    return {
      targetLevel: first?.level ?? null,
      ruleAvailable: first !== null,
      remainingActiveProducts: first
        ? Math.max(0, first.minimumActiveProducts - input.activeProductCount)
        : null,
      remainingRegistrationMonths: null,
      remainingQualifyingActivities: null,
    };
  }
  if (input.productLevel === "BRONZE" && input.resultingLevel === "BRONZE") {
    if (!input.matrix.silver) {
      return unavailableProgress("SILVER");
    }
    return {
      targetLevel: "SILVER",
      ruleAvailable: true,
      remainingActiveProducts: 0,
      remainingRegistrationMonths: Math.max(
        0,
        input.matrix.silver.minimumRegistrationMonths - input.registrationMonths,
      ),
      remainingQualifyingActivities: Math.max(
        0,
        input.matrix.silver.minimumQualifyingActivities - input.qualifyingActivityCount,
      ),
    };
  }
  const currentProductMinimum = input.thresholds
    .filter((threshold) => input.activeProductCount >= threshold.minimumActiveProducts)
    .at(-1)?.minimumActiveProducts ?? 0;
  const next = input.thresholds.find(
    (threshold) => threshold.minimumActiveProducts > currentProductMinimum,
  );
  return next
    ? {
        targetLevel: next.level,
        ruleAvailable: true,
        remainingActiveProducts: Math.max(
          0,
          next.minimumActiveProducts - input.activeProductCount,
        ),
        remainingRegistrationMonths: null,
        remainingQualifyingActivities: null,
      }
    : unavailableProgress(null);
}

function unavailableProgress(targetLevel: RewardsLevel | null): RewardsLevelProgress {
  return {
    targetLevel,
    ruleAvailable: false,
    remainingActiveProducts: null,
    remainingRegistrationMonths: null,
    remainingQualifyingActivities: null,
  };
}

function validateThresholds(
  thresholds: readonly ProductLevelThreshold[],
): readonly ProductLevelThreshold[] {
  if (thresholds.length === 0) throw new Error("At least one product level threshold is required");
  const sorted = [...thresholds].sort(
    (left, right) => left.minimumActiveProducts - right.minimumActiveProducts,
  );
  const seenLevels = new Set<RewardsLevel>();
  const seenCounts = new Set<number>();
  for (const threshold of sorted) {
    requireNonNegativeInteger("minimumActiveProducts", threshold.minimumActiveProducts);
    if (threshold.minimumActiveProducts === 0) {
      throw new Error("Product level thresholds must require at least one active product");
    }
    if (seenLevels.has(threshold.level) || seenCounts.has(threshold.minimumActiveProducts)) {
      throw new Error("Product level thresholds must be unique");
    }
    seenLevels.add(threshold.level);
    seenCounts.add(threshold.minimumActiveProducts);
  }
  if (sorted[0]?.level !== "BRONZE" || sorted[0].minimumActiveProducts !== 1) {
    throw new Error("The first product level threshold must be Bronze with one product");
  }
  return sorted;
}

function validateSilver(rule: SilverLevelRule | null): void {
  if (!rule) return;
  requireNonNegativeInteger("minimumRegistrationMonths", rule.minimumRegistrationMonths);
  requireNonNegativeInteger("minimumQualifyingActivities", rule.minimumQualifyingActivities);
  if (rule.minimumQualifyingActivities === 0) {
    throw new Error("Silver must require at least one qualifying activity");
  }
}

function requireNonNegativeInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}
