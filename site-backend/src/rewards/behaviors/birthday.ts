import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { PointIssuancePort } from "../ledger/issuance.js";
import { normalizeRewardEvent } from "../ledger/reward-event.js";
import type { Clock } from "../shared/clock.js";
import { RewardsError, rewardsErrors } from "../shared/errors.js";
import type { CustomerId, RewardsAccountId } from "../shared/identifiers.js";
import {
  requireEnabledBehaviorRule,
  type BehaviorRuleLookupPort,
  type EnabledBehaviorRule,
} from "./rule-lookup.js";

export type LeapDayPolicy = "FEBRUARY_28" | "MARCH_1";

export interface VerifiedBirthDateActor {
  accountId: RewardsAccountId;
  customerId: CustomerId;
}

export interface RecordVerifiedBirthDateCommand {
  birthDate: string;
  source: string;
  sourceId: string;
  sourceVersion: string;
}

export interface VerifiedBirthDateResult {
  verifiedBirthDateId: string;
  nextAwardYear: number;
  nextAwardAt: Date;
  replayed: boolean;
}

export interface VerifiedBirthDateStore {
  record(command: {
    actor: VerifiedBirthDateActor;
    birthDate: string;
    source: string;
    sourceId: string;
    sourceVersion: string;
    verifiedAt: Date;
    businessTimezone: string;
    leapDayPolicy: LeapDayPolicy;
  }): Promise<VerifiedBirthDateResult>;
}

export class RecordVerifiedBirthDate {
  constructor(
    private readonly rules: BehaviorRuleLookupPort,
    private readonly birthDates: VerifiedBirthDateStore,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: VerifiedBirthDateActor | null,
    command: RecordVerifiedBirthDateCommand,
  ): Promise<VerifiedBirthDateResult> {
    if (!actor) throw rewardsErrors.unauthenticated();
    const verifiedAt = this.clock.now();
    const rule = requireEnabledBehaviorRule(
      await this.rules.findEffective("BIRTHDAY", verifiedAt),
      "BIRTHDAY",
    );
    const configuration = birthdayConfiguration(rule);
    const source = bounded("birthDateSource", command.source, 80).toUpperCase();
    if (!configuration.verifiedSources.includes(source)) {
      throw rewardsErrors.ruleDisabled("The supplied birth-date source is not approved.");
    }
    return this.birthDates.record({
      actor,
      birthDate: validBirthDate(command.birthDate, verifiedAt),
      source,
      sourceId: bounded("birthDateSourceId", command.sourceId, 180),
      sourceVersion: bounded("birthDateSourceVersion", command.sourceVersion, 80),
      verifiedAt,
      businessTimezone: configuration.businessTimezone,
      leapDayPolicy: configuration.leapDayPolicy,
    });
  }
}

export interface BirthdayEligibilityPort {
  isEligible(actor: VerifiedBirthDateActor, asOf: Date): Promise<boolean>;
}

export interface BirthdayBatchResult {
  processedJobs: number;
  awardedJobs: number;
  ineligibleJobs: number;
  failedJobs: number;
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface AccountRow extends QueryResultRow { customer_id: string }
interface BirthDateRow extends QueryResultRow {
  id: string;
  account_id: string;
  customer_id: string;
  birth_date: string;
  source: string;
  source_id: string;
  source_version: string;
}
interface BirthdayJobRow extends QueryResultRow {
  job_id: string;
  account_id: string;
  customer_id: string;
  birth_date: string;
  verified_birth_date_id: string;
  award_year: number;
  business_timezone: string;
  leap_day_policy: LeapDayPolicy;
  due_at: Date;
  attempt_count: number;
}

export class PostgresVerifiedBirthDateStore implements VerifiedBirthDateStore {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async record(command: Parameters<VerifiedBirthDateStore["record"]>[0]): Promise<VerifiedBirthDateResult> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const account = (await client.query<AccountRow>(`
        SELECT customer_id::text FROM rewards_accounts WHERE id = $1 FOR UPDATE
      `, [command.actor.accountId])).rows[0];
      if (!account || account.customer_id !== command.actor.customerId) throw rewardsErrors.notEligible();
      const proposedId = this.generateId();
      const inserted = await client.query(`
        INSERT INTO verified_birth_dates (
          id, account_id, customer_id, birth_date, source, source_id,
          source_version, verified_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $8, $8)
        ON CONFLICT DO NOTHING
      `, [proposedId, command.actor.accountId, command.actor.customerId, command.birthDate,
        command.source, command.sourceId, command.sourceVersion, command.verifiedAt]);
      const persisted = (await client.query<BirthDateRow>(`
        SELECT id::text, account_id::text, customer_id::text, birth_date::text,
          source, source_id, source_version
        FROM verified_birth_dates WHERE account_id = $1
      `, [command.actor.accountId])).rows[0];
      if (!persisted) throw new Error("Verified birth date was not persisted");
      if (persisted.customer_id !== command.actor.customerId
        || persisted.birth_date !== command.birthDate
        || persisted.source !== command.source
        || persisted.source_id !== command.sourceId
        || persisted.source_version !== command.sourceVersion) {
        throw rewardsErrors.duplicateEvent();
      }
      const next = nextBirthday(command.birthDate, command.verifiedAt,
        command.businessTimezone, command.leapDayPolicy);
      await insertBirthdayJob(client, this.generateId(), persisted.id, command.actor,
        next.year, next.at, command.businessTimezone, command.leapDayPolicy, command.verifiedAt);
      await client.query("COMMIT");
      return {
        verifiedBirthDateId: persisted.id,
        nextAwardYear: next.year,
        nextAwardAt: next.at,
        replayed: inserted.rowCount === 0,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export class PostgresBirthdayScheduler {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly issuance: PointIssuancePort,
    private readonly eligibility: BirthdayEligibilityPort,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async processDue(asOf: Date, batchSize: number, workerId: string): Promise<BirthdayBatchResult> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
      throw new Error("Birthday batch size must be between 1 and 1000");
    }
    if (!workerId.trim()) throw new Error("Birthday worker ID cannot be empty");
    const client = await this.database.connect();
    const result: BirthdayBatchResult = {
      processedJobs: 0,
      awardedJobs: 0,
      ineligibleJobs: 0,
      failedJobs: 0,
    };
    try {
      await client.query("BEGIN");
      const jobs = (await client.query<BirthdayJobRow>(`
        SELECT job.id::text AS job_id, date.account_id::text, date.customer_id::text,
          date.birth_date::text, date.id::text AS verified_birth_date_id,
          (job.safe_payload->>'awardYear')::integer AS award_year,
          job.safe_payload->>'businessTimezone' AS business_timezone,
          job.safe_payload->>'leapDayPolicy' AS leap_day_policy,
          job.due_at, job.attempt_count
        FROM scheduled_rewards_jobs job
        JOIN verified_birth_dates date
          ON date.id = (job.safe_payload->>'verifiedBirthDateId')::uuid
        WHERE job.job_type = 'BIRTHDAY_AWARD'
          AND job.status IN ('PENDING', 'FAILED') AND job.due_at <= $1
        ORDER BY job.due_at, job.id
        LIMIT $2
        FOR UPDATE OF job SKIP LOCKED
      `, [asOf, batchSize])).rows;
      for (const job of jobs) {
        result.processedJobs += 1;
        const attemptNumber = job.attempt_count + 1;
        const executionId = this.generateId();
        await client.query(`
          UPDATE scheduled_rewards_jobs SET status = 'RUNNING', attempt_count = $2,
            locked_at = $3, locked_by = $4, updated_at = $3 WHERE id = $1
        `, [job.job_id, attemptNumber, asOf, workerId]);
        await client.query(`
          INSERT INTO rewards_job_executions (
            id, job_id, attempt_number, status, worker_id, started_at
          ) VALUES ($1, $2, $3, 'RUNNING', $4, $5)
        `, [executionId, job.job_id, attemptNumber, workerId, asOf]);
        try {
          const actor = {
            accountId: job.account_id as RewardsAccountId,
            customerId: job.customer_id as CustomerId,
          };
          if (await this.eligibility.isEligible(actor, asOf)) {
            await this.issuance.issue({
              accountId: actor.accountId,
              ruleCode: "BIRTHDAY",
              event: normalizeRewardEvent({
                source: "SCHEDULED",
                sourceId: birthdayAwardKey(actor.accountId, job.award_year),
                eventType: "BIRTHDAY",
                customerId: actor.customerId,
                occurredAt: job.due_at,
                receivedAt: asOf,
                safeMetadata: { awardYear: job.award_year },
              }),
              issuedAt: asOf,
            });
            result.awardedJobs += 1;
          } else {
            result.ineligibleJobs += 1;
          }
          const nextAt = birthdayForYear(job.birth_date, job.award_year + 1,
            job.business_timezone, job.leap_day_policy);
          await insertBirthdayJob(client, this.generateId(), job.verified_birth_date_id, actor,
            job.award_year + 1, nextAt, job.business_timezone, job.leap_day_policy, asOf);
          await client.query(`
            UPDATE scheduled_rewards_jobs SET status = 'SUCCEEDED', completed_at = $2,
              locked_at = NULL, locked_by = NULL, updated_at = $2 WHERE id = $1
          `, [job.job_id, asOf]);
          await client.query(`
            UPDATE rewards_job_executions SET status = 'SUCCEEDED', finished_at = $2
            WHERE id = $1
          `, [executionId, asOf]);
        } catch (error) {
          result.failedJobs += 1;
          const safeCode = error instanceof RewardsError ? error.code : "birthday_processing_failed";
          await client.query(`
            UPDATE scheduled_rewards_jobs SET status = 'FAILED', locked_at = NULL,
              locked_by = NULL, updated_at = $2 WHERE id = $1
          `, [job.job_id, asOf]);
          await client.query(`
            UPDATE rewards_job_executions SET status = 'FAILED', finished_at = $2,
              safe_error_code = $3 WHERE id = $1
          `, [executionId, asOf, safeCode]);
        }
      }
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export function birthdayAwardKey(accountId: RewardsAccountId, year: number): string {
  return `birthday:${accountId}:${year}`;
}

export function nextBirthday(
  birthDate: string,
  asOf: Date,
  timezone: string,
  leapDayPolicy: LeapDayPolicy,
): { year: number; at: Date } {
  const localYear = Number(formatParts(asOf, timezone).year);
  const thisYear = birthdayForYear(birthDate, localYear, timezone, leapDayPolicy);
  if (thisYear.getTime() >= asOf.getTime()) return { year: localYear, at: thisYear };
  return {
    year: localYear + 1,
    at: birthdayForYear(birthDate, localYear + 1, timezone, leapDayPolicy),
  };
}

export function birthdayForYear(
  birthDate: string,
  year: number,
  timezone: string,
  leapDayPolicy: LeapDayPolicy,
): Date {
  const [, monthText, dayText] = birthDate.split("-");
  let month = Number(monthText);
  let day = Number(dayText);
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    if (leapDayPolicy === "FEBRUARY_28") day = 28;
    else { month = 3; day = 1; }
  }
  return localMidnight(year, month, day, timezone);
}

function birthdayConfiguration(rule: EnabledBehaviorRule): {
  verifiedSources: readonly string[];
  businessTimezone: string;
  leapDayPolicy: LeapDayPolicy;
} {
  const sources = rule.configuration.verifiedSources;
  const timezone = rule.configuration.businessTimezone;
  const leapDayPolicy = rule.configuration.leapDayPolicy;
  if (!Array.isArray(sources) || sources.length === 0
    || !sources.every((source) => typeof source === "string" && source.trim())
    || typeof timezone !== "string"
    || (leapDayPolicy !== "FEBRUARY_28" && leapDayPolicy !== "MARCH_1")) {
    throw rewardsErrors.ruleDisabled("Verified birth-date configuration is incomplete.");
  }
  formatParts(rule.effectiveFrom, timezone);
  return {
    verifiedSources: sources.map((source) => source.trim().toUpperCase()),
    businessTimezone: timezone,
    leapDayPolicy,
  };
}

async function insertBirthdayJob(
  client: PoolClient,
  jobId: string,
  verifiedBirthDateId: string,
  actor: VerifiedBirthDateActor,
  year: number,
  dueAt: Date,
  timezone: string,
  leapDayPolicy: LeapDayPolicy,
  createdAt: Date,
): Promise<void> {
  await client.query(`
    INSERT INTO scheduled_rewards_jobs (
      id, job_type, business_key, due_at, status, safe_payload, created_at, updated_at
    ) VALUES ($1, 'BIRTHDAY_AWARD', $2, $3, 'PENDING', $4::jsonb, $5, $5)
    ON CONFLICT (job_type, business_key) DO NOTHING
  `, [jobId, birthdayAwardKey(actor.accountId, year), dueAt, JSON.stringify({
    verifiedBirthDateId,
    awardYear: year,
    businessTimezone: timezone,
    leapDayPolicy,
  }), createdAt]);
}

function validBirthDate(value: string, verifiedAt: Date): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Birth date must use YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Birth date must be a real calendar date");
  }
  if (year < 1900 || date.getTime() > verifiedAt.getTime()) {
    throw new Error("Birth date is outside the supported verified range");
  }
  return value.trim();
}

function localMidnight(year: number, month: number, day: number, timezone: string): Date {
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatParts(new Date(guess), timezone);
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1,
      Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = target - represented;
    guess += correction;
    if (correction === 0) break;
  }
  const result = new Date(guess);
  const parts = formatParts(result, timezone);
  if (Number(parts.year) !== year || Number(parts.month) !== month || Number(parts.day) !== day
    || Number(parts.hour) !== 0) throw new Error("Birthday local midnight could not be calculated");
  return result;
}

function formatParts(instant: Date, timezone: string): Record<string, string> {
  if (Number.isNaN(instant.getTime())) throw new Error("Birthday instant must be valid");
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(instant);
  } catch {
    throw new Error("Birthday business timezone is invalid");
  }
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function bounded(name: string, value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} cannot be empty`);
  if (normalized.length > maximum) throw new Error(`${name} cannot exceed ${maximum} characters`);
  return normalized;
}
