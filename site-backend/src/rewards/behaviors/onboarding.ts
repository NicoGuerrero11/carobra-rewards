import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { PointIssuancePort, PointIssuanceResult } from "../ledger/issuance.js";
import {
  normalizeRewardEvent,
  type NormalizeRewardEventInput,
  type NormalizedRewardEvent,
} from "../ledger/reward-event.js";
import type { Clock } from "../shared/clock.js";
import type { RewardEventSource } from "../shared/enums.js";
import { RewardsError, rewardsErrors } from "../shared/errors.js";
import type { CustomerId, RewardsAccountId } from "../shared/identifiers.js";

export const onboardingEvidenceTypes = ["CONFIRMATION", "VIDEO", "SURVEY"] as const;
export type OnboardingEvidenceType = (typeof onboardingEvidenceTypes)[number];

export interface RecordOnboardingEvidenceCommand {
  accountId: RewardsAccountId;
  customerId: CustomerId;
  onboardingInstanceId: string;
  evidenceType: OnboardingEvidenceType;
  evidenceVersion: string;
  source: RewardEventSource;
  sourceId: string;
  occurredAt: Date;
  receivedAt: Date;
  safeMetadata?: Readonly<Record<string, unknown>>;
}

export interface OnboardingEvidenceProgress {
  evidenceTypes: readonly OnboardingEvidenceType[];
  evidenceVersions: Readonly<Record<OnboardingEvidenceType, string | null>>;
  completedAt: Date | null;
  replayedEvidence: boolean;
}

export interface OnboardingEvidenceStore {
  record(
    command: Omit<RecordOnboardingEvidenceCommand, "source" | "sourceId" | "occurredAt" | "receivedAt" | "safeMetadata"> & {
      event: NormalizedRewardEvent;
    },
  ): Promise<OnboardingEvidenceProgress>;
}

export interface OnboardingEvidenceResult extends OnboardingEvidenceProgress {
  complete: boolean;
  awardStatus: "PENDING_EVIDENCE" | "RULE_DISABLED" | "AWARDED";
  disabledReason: string | null;
  award: PointIssuanceResult | null;
}

export class RecordOnboardingEvidence {
  constructor(
    private readonly evidence: OnboardingEvidenceStore,
    private readonly issuance: PointIssuancePort,
    private readonly clock: Clock,
  ) {}

  async execute(command: RecordOnboardingEvidenceCommand): Promise<OnboardingEvidenceResult> {
    validateEvidenceType(command.evidenceType);
    const onboardingInstanceId = bounded("onboardingInstanceId", command.onboardingInstanceId, 100);
    const evidenceVersion = bounded("evidenceVersion", command.evidenceVersion, 80);
    const event = normalizeRewardEvent(evidenceEvent(command));
    const progress = await this.evidence.record({
      accountId: command.accountId,
      customerId: command.customerId,
      onboardingInstanceId,
      evidenceType: command.evidenceType,
      evidenceVersion,
      event,
    });
    const complete = onboardingEvidenceTypes.every((type) => progress.evidenceTypes.includes(type));
    if (!complete || progress.completedAt === null) {
      return {
        ...progress,
        complete: false,
        awardStatus: "PENDING_EVIDENCE",
        disabledReason: null,
        award: null,
      };
    }

    try {
      const awardedAt = this.clock.now();
      const award = await this.issuance.issue({
        accountId: command.accountId,
        ruleCode: "ONBOARDING_COMPLETION",
        event: normalizeRewardEvent({
          source: "INTERNAL",
          sourceId: `onboarding-completion:${command.accountId}:${onboardingInstanceId}`,
          eventType: "ONBOARDING_COMPLETION",
          customerId: command.customerId,
          occurredAt: progress.completedAt,
          receivedAt: awardedAt,
          safeMetadata: {
            onboardingInstanceId,
            evidenceTypes: progress.evidenceTypes,
            evidenceVersions: progress.evidenceVersions,
          },
        }),
        issuedAt: awardedAt,
      });
      return {
        ...progress,
        complete: true,
        awardStatus: "AWARDED",
        disabledReason: null,
        award,
      };
    } catch (error) {
      if (error instanceof RewardsError && error.code === "rule_disabled") {
        return {
          ...progress,
          complete: true,
          awardStatus: "RULE_DISABLED",
          disabledReason: typeof error.details?.reason === "string" ? error.details.reason : null,
          award: null,
        };
      }
      throw error;
    }
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface AccountRow extends QueryResultRow { customer_id: string }
interface EvidenceRow extends QueryResultRow {
  evidence_type: OnboardingEvidenceType;
  evidence_version: string;
  source: RewardEventSource;
  source_id: string;
  account_id: string;
  customer_id: string;
  onboarding_instance_id: string;
  occurred_at: Date;
}

export class PostgresOnboardingEvidenceStore implements OnboardingEvidenceStore {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async record(
    command: Parameters<OnboardingEvidenceStore["record"]>[0],
  ): Promise<OnboardingEvidenceProgress> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const account = (await client.query<AccountRow>(`
        SELECT customer_id::text FROM rewards_accounts WHERE id = $1 FOR UPDATE
      `, [command.accountId])).rows[0];
      if (!account || account.customer_id !== command.customerId) throw rewardsErrors.notEligible();

      const inserted = await client.query(`
        INSERT INTO onboarding_evidence (
          id, account_id, customer_id, onboarding_instance_id, evidence_type,
          evidence_version, source, source_id, occurred_at, received_at,
          safe_metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $10, $10)
        ON CONFLICT DO NOTHING
      `, [
        this.generateId(),
        command.accountId,
        command.customerId,
        command.onboardingInstanceId,
        command.evidenceType,
        command.evidenceVersion,
        command.event.source,
        command.event.sourceId,
        command.event.occurredAt,
        command.event.receivedAt,
        JSON.stringify(command.event.safeMetadata),
      ]);
      const replayedEvidence = inserted.rowCount === 0;
      if (replayedEvidence) {
        const sourceCollision = (await client.query<EvidenceRow>(`
          SELECT evidence_type, evidence_version, source, source_id,
            account_id::text, customer_id::text, onboarding_instance_id, occurred_at
          FROM onboarding_evidence WHERE source = $1 AND source_id = $2
        `, [command.event.source, command.event.sourceId])).rows[0];
        if (sourceCollision && (
          sourceCollision.account_id !== command.accountId
          || sourceCollision.customer_id !== command.customerId
          || sourceCollision.onboarding_instance_id !== command.onboardingInstanceId
          || sourceCollision.evidence_type !== command.evidenceType
        )) {
          throw rewardsErrors.duplicateEvent();
        }
      }

      const rows = (await client.query<EvidenceRow>(`
        SELECT evidence_type, evidence_version, source, source_id,
          account_id::text, customer_id::text, onboarding_instance_id, occurred_at
        FROM onboarding_evidence
        WHERE account_id = $1 AND onboarding_instance_id = $2
        ORDER BY occurred_at, evidence_type
      `, [command.accountId, command.onboardingInstanceId])).rows;
      const evidenceTypes = rows.map((row) => row.evidence_type);
      const evidenceVersions: Record<OnboardingEvidenceType, string | null> = {
        CONFIRMATION: null,
        VIDEO: null,
        SURVEY: null,
      };
      for (const row of rows) evidenceVersions[row.evidence_type] = row.evidence_version;
      const completedAt = onboardingEvidenceTypes.every((type) => evidenceTypes.includes(type))
        ? new Date(Math.max(...rows.map((row) => row.occurred_at.getTime())))
        : null;
      await client.query("COMMIT");
      return { evidenceTypes, evidenceVersions, completedAt, replayedEvidence };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function evidenceEvent(command: RecordOnboardingEvidenceCommand): NormalizeRewardEventInput {
  return {
    source: command.source,
    sourceId: command.sourceId,
    eventType: `ONBOARDING_${command.evidenceType}`,
    customerId: command.customerId,
    occurredAt: command.occurredAt,
    receivedAt: command.receivedAt,
    ...(command.safeMetadata === undefined ? {} : { safeMetadata: command.safeMetadata }),
  };
}

function validateEvidenceType(value: string): asserts value is OnboardingEvidenceType {
  if (!onboardingEvidenceTypes.includes(value as OnboardingEvidenceType)) {
    throw new Error("Unsupported onboarding evidence type");
  }
}

function bounded(name: string, value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} cannot be empty`);
  if (normalized.length > maximum) throw new Error(`${name} cannot exceed ${maximum} characters`);
  return normalized;
}
