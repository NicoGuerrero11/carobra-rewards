import { rewardEventSources, type RewardEventSource } from "../shared/enums.js";
import type { CustomerId, ProductContractId } from "../shared/identifiers.js";
import { assertSafeMetadata } from "../shared/privacy.js";

export interface NormalizeRewardEventInput {
  source: RewardEventSource;
  sourceId: string;
  eventType: string;
  customerId: CustomerId;
  occurredAt: Date;
  receivedAt: Date;
  serviceId?: string;
  productContractId?: ProductContractId;
  safeMetadata?: Readonly<Record<string, unknown>>;
}

export interface NormalizedRewardEvent {
  source: RewardEventSource;
  sourceId: string;
  sourceIdentity: string;
  eventType: string;
  customerId: CustomerId;
  occurredAt: Date;
  receivedAt: Date;
  serviceId: string | null;
  productContractId: ProductContractId | null;
  safeMetadata: Readonly<Record<string, unknown>>;
}

export function normalizeRewardEvent(input: NormalizeRewardEventInput): NormalizedRewardEvent {
  if (!rewardEventSources.includes(input.source)) {
    throw new Error("Unsupported reward event source");
  }
  const sourceId = boundedValue("sourceId", input.sourceId, 180);
  const eventType = boundedValue("eventType", input.eventType, 80).toUpperCase();
  const occurredAt = validInstant("occurredAt", input.occurredAt);
  const receivedAt = validInstant("receivedAt", input.receivedAt);
  if (occurredAt.getTime() > receivedAt.getTime()) {
    throw new Error("Reward event occurredAt cannot be after receivedAt");
  }
  const safeMetadata = input.safeMetadata ?? {};
  assertSafeMetadata(safeMetadata, "reward event metadata");
  return Object.freeze({
    source: input.source,
    sourceId,
    sourceIdentity: rewardEventSourceIdentity(input.source, sourceId),
    eventType,
    customerId: input.customerId,
    occurredAt,
    receivedAt,
    serviceId: input.serviceId ? boundedValue("serviceId", input.serviceId, 180) : null,
    productContractId: input.productContractId ?? null,
    safeMetadata: Object.freeze({ ...safeMetadata }),
  });
}

export function rewardEventSourceIdentity(
  source: RewardEventSource,
  sourceId: string,
): string {
  return `${source}:${boundedValue("sourceId", sourceId, 180)}`;
}

function boundedValue(name: string, value: string, maximumLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} cannot be empty`);
  if (normalized.length > maximumLength) {
    throw new Error(`${name} cannot exceed ${maximumLength} characters`);
  }
  return normalized;
}

function validInstant(name: string, value: Date): Date {
  if (Number.isNaN(value.getTime())) throw new Error(`${name} must be a valid instant`);
  return new Date(value.getTime());
}
