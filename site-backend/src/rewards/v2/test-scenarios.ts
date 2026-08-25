import { timingSafeEqual } from "node:crypto";

import type { SiteBackendConfig } from "../../config.js";
import type {
  RewardsJourneyState,
  RewardsLevel,
  RewardsProductFactStatus,
} from "../shared/enums.js";
import { rewardsErrors } from "../shared/errors.js";
import {
  evaluateRewardsLevel,
  type RewardsLevelMatrix,
} from "./level-engine.js";
import {
  assertRewardsJourneySummaryContract,
  type RewardsJourneySummaryHttpResponse,
} from "./journey-summary-contract.js";
import { evaluateRedemptionAccess } from "./redemption-access.js";

export const rewardsV2TestAccessHeader = "x-rewards-v2-test-key";

export interface RewardsV2TestScenarioListItem {
  code: string;
  name: string;
  description: string;
}

interface ScenarioDefinition extends RewardsV2TestScenarioListItem {
  customerId: string;
  journeyState: RewardsJourneyState;
  validationStatus: string;
  currentLevel: RewardsLevel | null;
  registrationMonths: number;
  qualifyingActivityCount: number;
  products: ReadonlyArray<{
    productType: string;
    status: RewardsProductFactStatus;
  }>;
}

const scenarioNow = new Date("2026-08-24T12:00:00.000Z");
const registrationAt = new Date("2026-01-24T12:00:00.000Z");
const testExpiryAt = new Date("2027-07-24T12:00:00.000Z");
const activeAfore = { productType: "AFORE", status: "ACTIVE" as const };
const activeSkandia = { productType: "PPR", status: "ACTIVE" as const };
const activeQualitas = { productType: "AUTO_POLICY", status: "ACTIVE" as const };
const activeAdditional = { productType: "ADDITIONAL_PRODUCT", status: "ACTIVE" as const };

const internalMatrix: RewardsLevelMatrix = {
  productThresholds: [
    { level: "BRONZE", minimumActiveProducts: 1 },
    { level: "GOLD", minimumActiveProducts: 2 },
    { level: "PLATINUM", minimumActiveProducts: 3 },
    { level: "TITANIUM", minimumActiveProducts: 4 },
  ],
  silver: {
    minimumRegistrationMonths: 6,
    minimumQualifyingActivities: 3,
  },
};

const scenarioDefinitions: readonly ScenarioDefinition[] = [
  scenario("invited", "Invitado", "Registro completo; el primer producto sigue en validación.", {
    journeyState: "INVITED",
    validationStatus: "PENDING",
    currentLevel: null,
    registrationMonths: 0,
    qualifyingActivityCount: 0,
    products: [],
  }),
  scenario("pending-sisca", "Validación pendiente", "Invitado esperando confirmación de AFORE.", {
    journeyState: "INVITED",
    validationStatus: "REQUIRES_ATTENTION",
    currentLevel: null,
    registrationMonths: 1,
    qualifyingActivityCount: 1,
    products: [],
  }),
  scenario("bronze", "Bronce", "Primer producto activo validado.", {
    journeyState: "ACTIVE",
    validationStatus: "VALIDATED",
    currentLevel: "BRONZE",
    registrationMonths: 3,
    qualifyingActivityCount: 1,
    products: [activeAfore],
  }),
  scenario("silver", "Plata", "Regla interna de seis meses y tres actividades.", {
    journeyState: "ACTIVE",
    validationStatus: "VALIDATED",
    currentLevel: "SILVER",
    registrationMonths: 7,
    qualifyingActivityCount: 3,
    products: [activeAfore],
  }),
  scenario("gold", "Oro", "Dos productos activos.", {
    journeyState: "ACTIVE",
    validationStatus: "VALIDATED",
    currentLevel: "GOLD",
    registrationMonths: 8,
    qualifyingActivityCount: 5,
    products: [activeAfore, activeSkandia],
  }),
  scenario("platinum", "Platino", "Tres productos activos.", {
    journeyState: "ACTIVE",
    validationStatus: "VALIDATED",
    currentLevel: "PLATINUM",
    registrationMonths: 10,
    qualifyingActivityCount: 8,
    products: [activeAfore, activeSkandia, activeQualitas],
  }),
  scenario("titanium", "Titanio", "Cuatro productos activos.", {
    journeyState: "ACTIVE",
    validationStatus: "VALIDATED",
    currentLevel: "TITANIUM",
    registrationMonths: 14,
    qualifyingActivityCount: 12,
    products: [activeAfore, activeSkandia, activeQualitas, activeAdditional],
  }),
  scenario("cancelled", "Producto cancelado", "Sin producto activo y sin canje.", {
    journeyState: "INACTIVE",
    validationStatus: "VALIDATED",
    currentLevel: null,
    registrationMonths: 9,
    qualifyingActivityCount: 5,
    products: [{ ...activeAfore, status: "CANCELLED" }],
  }),
  scenario("reactivated", "Reactivado", "Producto nuevamente activo; se recalcula Bronce.", {
    journeyState: "ACTIVE",
    validationStatus: "VALIDATED",
    currentLevel: "BRONZE",
    registrationMonths: 9,
    qualifyingActivityCount: 1,
    products: [activeAfore],
  }),
];

export class RewardsV2TestScenarioApplication {
  list(): readonly RewardsV2TestScenarioListItem[] {
    return scenarioDefinitions.map(({ code, name, description }) => ({ code, name, description }));
  }

  get(code: string): RewardsJourneySummaryHttpResponse | null {
    const definition = scenarioDefinitions.find((candidate) => candidate.code === code);
    return definition ? buildSummary(definition) : null;
  }
}

export function authorizeRewardsV2TestRequest(
  config: SiteBackendConfig,
  receivedAccessKey: string | undefined,
): void {
  const testMode = config.rewardsV2TestMode;
  if (!testMode || !receivedAccessKey) throw rewardsErrors.forbidden();
  const expected = Buffer.from(testMode.accessKey, "utf8");
  const received = Buffer.from(receivedAccessKey, "utf8");
  if (expected.byteLength !== received.byteLength || !timingSafeEqual(expected, received)) {
    throw rewardsErrors.forbidden();
  }
}

function buildSummary(definition: ScenarioDefinition): RewardsJourneySummaryHttpResponse {
  const activeProductCount = definition.products.filter((product) => product.status === "ACTIVE").length;
  const evaluation = evaluateRewardsLevel({
    currentLevel: definition.currentLevel,
    activeProductCount,
    registrationMonths: definition.registrationMonths,
    qualifyingActivityCount: definition.qualifyingActivityCount,
    matrix: internalMatrix,
  });
  if (evaluation.resultingLevel !== definition.currentLevel) {
    throw new Error(`Test scenario ${definition.code} does not match the shared level engine`);
  }
  const redemption = evaluateRedemptionAccess({
    activeProductCount,
    redemptionFeatureEnabled: false,
  });
  const hasActiveProduct = activeProductCount > 0;
  return assertRewardsJourneySummaryContract({
    customer_id: definition.customerId,
    journey: {
      state: definition.journeyState,
      current_level: evaluation.resultingLevel,
      validation_status: definition.validationStatus,
      registered_at: registrationAt.toISOString(),
    },
    redemption,
    points: {
      available: hasActiveProduct ? "150" : "45",
      reserved: "0",
      next_expiration_at: testExpiryAt.toISOString(),
    },
    progress: {
      target_level: evaluation.progress.targetLevel,
      rule_available: evaluation.progress.ruleAvailable,
      remaining_active_products: evaluation.progress.remainingActiveProducts,
      remaining_registration_months: evaluation.progress.remainingRegistrationMonths,
      remaining_qualifying_activities: evaluation.progress.remainingQualifyingActivities,
    },
    products: definition.products.map((product) => ({
      product_type: product.productType,
      status: product.status,
      activated_at: product.status === "ACTIVE" ? scenarioNow.toISOString() : null,
    })),
    recent_movements: hasActiveProduct
      ? [
          { code: "V2_INITIAL_PRODUCT_ACTIVE", points_delta: "105", occurred_at: scenarioNow.toISOString() },
          { code: "V2_INVITED_REGISTRATION", points_delta: "45", occurred_at: registrationAt.toISOString() },
        ]
      : [
          { code: "V2_INVITED_REGISTRATION", points_delta: "45", occurred_at: registrationAt.toISOString() },
        ],
    modules: {
      benefits_enabled: false,
      expiry_policy_approved: false,
      ave_enabled: false,
      referrals_enabled: false,
      renewals_enabled: false,
    },
  });
}

function scenario(
  code: string,
  name: string,
  description: string,
  state: Omit<ScenarioDefinition, "code" | "name" | "description" | "customerId">,
): ScenarioDefinition {
  const index = scenarioDefinitionsSeedIndex(code);
  return {
    code,
    name,
    description,
    customerId: `00000000-0000-4000-9000-${String(index).padStart(12, "0")}`,
    ...state,
  };
}

function scenarioDefinitionsSeedIndex(code: string): number {
  const codes = [
    "invited", "pending-sisca", "bronze", "silver", "gold",
    "platinum", "titanium", "cancelled", "reactivated",
  ];
  const index = codes.indexOf(code);
  if (index < 0) throw new Error("Unknown V2 scenario code");
  return index + 1;
}
