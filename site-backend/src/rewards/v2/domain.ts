import type {
  RewardsLevel,
  RewardsProductFactStatus,
  RewardsV2RuleType,
} from "../shared/enums.js";
import {
  rewardsLevels,
  rewardsProductFactStatuses,
  rewardsV2RuleTypes,
} from "../shared/enums.js";
import { rewardsErrors } from "../shared/errors.js";
import { assertSafeMetadata, assertSafeText } from "../shared/privacy.js";

export function normalizeProvider(value: string): string {
  return code("provider", value, 40);
}

export function normalizeProductType(value: string): string {
  return code("productType", value, 80);
}

export function normalizeActivityType(value: string): string {
  return code("activityType", value, 80);
}

export function normalizeSource(value: string): string {
  return code("source", value, 40);
}

export function normalizeSourceId(value: string): string {
  return assertSafeText("sourceId", value, 180);
}

export function normalizeExternalReference(value: string | null | undefined): string | null {
  return value === null || value === undefined
    ? null
    : assertSafeText("externalReference", value, 180);
}

export function requireInstant(label: string, value: Date): Date {
  if (Number.isNaN(value.getTime())) throw new Error(`${label} must be a valid instant`);
  return value;
}

export function requireSafeObject(
  label: string,
  value: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  const normalized = value ?? {};
  assertSafeMetadata(normalized, label);
  return normalized;
}

export function requireProductFactStatus(value: string): RewardsProductFactStatus {
  if (!rewardsProductFactStatuses.includes(value as RewardsProductFactStatus)) {
    throw new Error("Product fact status is invalid");
  }
  return value as RewardsProductFactStatus;
}

export function requireRewardsLevel(value: string | null): RewardsLevel | null {
  if (value === null) return null;
  if (!rewardsLevels.includes(value as RewardsLevel)) {
    throw new Error("Rewards level is invalid");
  }
  return value as RewardsLevel;
}

export function requireV2RuleType(value: string): RewardsV2RuleType {
  if (!rewardsV2RuleTypes.includes(value as RewardsV2RuleType)) {
    throw new Error("Rewards V2 rule type is invalid");
  }
  return value as RewardsV2RuleType;
}

export function assertProductStatusTransition(
  from: RewardsProductFactStatus | null,
  to: RewardsProductFactStatus,
): void {
  if (from === null || from === to) return;
  const allowed: Readonly<Record<RewardsProductFactStatus, readonly RewardsProductFactStatus[]>> = {
    SIGNED: ["PENDING", "ACTIVE", "REJECTED", "CANCELLED"],
    PENDING: ["ACTIVE", "REJECTED", "CANCELLED"],
    ACTIVE: ["CANCELLED", "ENDED"],
    REJECTED: ["PENDING"],
    CANCELLED: ["PENDING", "ACTIVE"],
    ENDED: ["PENDING", "ACTIVE"],
  };
  if (!allowed[from].includes(to)) throw rewardsErrors.invalidTransition();
}

export function assertProductEvidenceChronology(input: {
  status: RewardsProductFactStatus;
  occurredAt: Date;
  receivedAt: Date;
  signedAt: Date | null;
  acceptedAt: Date | null;
  activatedAt: Date | null;
  endedAt: Date | null;
}): void {
  requireInstant("occurredAt", input.occurredAt);
  requireInstant("receivedAt", input.receivedAt);
  if (input.receivedAt < input.occurredAt) {
    throw new Error("Product evidence cannot be received before it occurred");
  }
  for (const [label, instant] of [
    ["signedAt", input.signedAt],
    ["acceptedAt", input.acceptedAt],
    ["activatedAt", input.activatedAt],
    ["endedAt", input.endedAt],
  ] as const) {
    if (instant) requireInstant(label, instant);
  }
  if (input.signedAt && input.acceptedAt && input.acceptedAt < input.signedAt) {
    throw new Error("Product acceptance cannot precede signature");
  }
  if (input.acceptedAt && input.activatedAt && input.activatedAt < input.acceptedAt) {
    throw new Error("Product activation cannot precede acceptance");
  }
  if (input.activatedAt && input.endedAt && input.endedAt < input.activatedAt) {
    throw new Error("Product ending cannot precede activation");
  }
  if (input.status === "ACTIVE" && (!input.acceptedAt || !input.activatedAt)) {
    throw new Error("An active product requires acceptedAt and activatedAt evidence");
  }
}

function code(label: string, value: string, maximumLength: number): string {
  const normalized = assertSafeText(label, value, maximumLength).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.:-]*$/.test(normalized)) {
    throw new Error(`${label} must contain only safe code characters`);
  }
  return normalized;
}
