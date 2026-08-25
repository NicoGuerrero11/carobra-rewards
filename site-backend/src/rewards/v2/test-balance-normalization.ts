import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

const NORMALIZATION_REASON = "V2_TEST_BALANCE_NORMALIZATION";
const IDEMPOTENCY_PREFIX = "rewards-v2-test-balance-normalization";

export interface TestBalanceCandidate {
  accountId: string;
  availablePoints: bigint;
  legacyRemainingPoints: bigint;
  legacyReservedPoints: bigint;
}

export interface TestBalanceCandidateQuery {
  list(): Promise<readonly TestBalanceCandidate[]>;
}

export interface TestBalanceAdjustment {
  normalize(accountId: string, normalizedAt: Date): Promise<{
    outcome: "normalized" | "already_normalized";
    removedPoints: bigint;
  }>;
}

export interface TestBalanceNormalizationResult {
  scanned: number;
  wouldNormalize: number;
  wouldRemovePoints: bigint;
  normalized: number;
  alreadyNormalized: number;
  removedPoints: bigint;
  failures: ReadonlyArray<{ accountId: string; code: string }>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
}

interface TransactionalDatabase {
  connect(): Promise<PoolClient>;
}

interface CandidateRow extends QueryResultRow {
  account_id: string;
  available_points: string;
  legacy_remaining_points: string;
  legacy_reserved_points: string;
}

interface AccountRow extends QueryResultRow {
  available_points: string;
}

interface LotRow extends QueryResultRow {
  lot_id: string;
  remaining_points: string;
  reserved_points: string;
}

export class BalanceNormalizationError extends Error {
  constructor(readonly code: "legacy_points_reserved" | "legacy_balance_inconsistent") {
    super(code);
    this.name = "BalanceNormalizationError";
  }
}

export class PostgresTestBalanceCandidateQuery implements TestBalanceCandidateQuery {
  constructor(private readonly database: Queryable) {}

  async list(): Promise<readonly TestBalanceCandidate[]> {
    const result = await this.database.query<CandidateRow>(`
      SELECT
        account.id::text AS account_id,
        account.available_points::text,
        legacy.remaining_points::text AS legacy_remaining_points,
        legacy.reserved_points::text AS legacy_reserved_points
      FROM rewards_accounts AS account
      JOIN rewards_v2_journeys AS journey ON journey.account_id = account.id
      JOIN LATERAL (
        SELECT
          COALESCE((
            SELECT sum(lot.remaining_points)
            FROM point_lots AS lot
            JOIN ledger_entries AS source_entry ON source_entry.id = lot.source_ledger_entry_id
            WHERE lot.account_id = account.id
              AND source_entry.rule_version_id IS NOT NULL
              AND source_entry.v2_rule_version_id IS NULL
              AND lot.remaining_points > 0
          ), 0) AS remaining_points,
          COALESCE((
            SELECT sum(allocation.points)
            FROM point_allocations AS allocation
            JOIN point_lots AS lot ON lot.id = allocation.lot_id
            JOIN ledger_entries AS source_entry ON source_entry.id = lot.source_ledger_entry_id
            WHERE lot.account_id = account.id
              AND source_entry.rule_version_id IS NOT NULL
              AND source_entry.v2_rule_version_id IS NULL
              AND allocation.status = 'RESERVED'
          ), 0) AS reserved_points
      ) AS legacy ON legacy.remaining_points > 0
      ORDER BY account.id
    `);
    return result.rows.map((row) => ({
      accountId: row.account_id,
      availablePoints: BigInt(row.available_points),
      legacyRemainingPoints: BigInt(row.legacy_remaining_points),
      legacyReservedPoints: BigInt(row.legacy_reserved_points),
    }));
  }
}

export class PostgresTestBalanceAdjustment implements TestBalanceAdjustment {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async normalize(accountId: string, normalizedAt: Date): Promise<{
    outcome: "normalized" | "already_normalized";
    removedPoints: bigint;
  }> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const result = await this.normalizeInTransaction(client, accountId, normalizedAt);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async normalizeInTransaction(
    client: PoolClient,
    accountId: string,
    normalizedAt: Date,
  ): Promise<{ outcome: "normalized" | "already_normalized"; removedPoints: bigint }> {
    const account = (await client.query<AccountRow>(`
      SELECT available_points::text
      FROM rewards_accounts
      WHERE id = $1
        AND EXISTS (
          SELECT 1 FROM rewards_v2_journeys AS journey
          WHERE journey.account_id = rewards_accounts.id
        )
      FOR UPDATE
    `, [accountId])).rows[0];
    if (!account) throw new BalanceNormalizationError("legacy_balance_inconsistent");

    const idempotencyKey = `${IDEMPOTENCY_PREFIX}:${accountId}`;
    const replay = await client.query(`
      SELECT 1 FROM ledger_entries WHERE idempotency_key = $1
    `, [idempotencyKey]);
    if (replay.rowCount !== 0) {
      return { outcome: "already_normalized", removedPoints: 0n };
    }

    const lots = (await client.query<LotRow>(`
      SELECT
        lot.id::text AS lot_id,
        lot.remaining_points::text,
        COALESCE((
          SELECT sum(allocation.points)
          FROM point_allocations AS allocation
          WHERE allocation.lot_id = lot.id
            AND allocation.status = 'RESERVED'
        ), 0)::text AS reserved_points
      FROM point_lots AS lot
      JOIN ledger_entries AS source_entry ON source_entry.id = lot.source_ledger_entry_id
      WHERE lot.account_id = $1
        AND source_entry.rule_version_id IS NOT NULL
        AND source_entry.v2_rule_version_id IS NULL
        AND lot.remaining_points > 0
      ORDER BY lot.id
      FOR UPDATE OF lot
    `, [accountId])).rows;
    if (lots.length === 0) return { outcome: "already_normalized", removedPoints: 0n };

    const reservedPoints = lots.reduce((sum, lot) => sum + BigInt(lot.reserved_points), 0n);
    if (reservedPoints > 0n) throw new BalanceNormalizationError("legacy_points_reserved");
    const removablePoints = lots.reduce((sum, lot) => sum + BigInt(lot.remaining_points), 0n);
    if (BigInt(account.available_points) < removablePoints) {
      throw new BalanceNormalizationError("legacy_balance_inconsistent");
    }

    await client.query(`
      INSERT INTO ledger_entries (
        id, account_id, entry_type, points_delta, idempotency_key,
        correlation_id, actor_type, actor_id, reason_code, explanation, created_at
      ) VALUES (
        $1, $2, 'ADJUSTMENT', $3, $4,
        $5, 'SYSTEM', $6, $7, $8, $9
      )
    `, [
      this.generateId(),
      accountId,
      (-removablePoints).toString(),
      idempotencyKey,
      this.generateId(),
      "rewards-v2-normalization",
      NORMALIZATION_REASON,
      "Retired Rewards V1 points removed from a test customer balance.",
      normalizedAt,
    ]);
    await client.query(`
      UPDATE point_lots
      SET remaining_points = 0,
          expired_at = COALESCE(expired_at, $2),
          updated_at = $2
      WHERE id = ANY($1::uuid[])
    `, [lots.map((lot) => lot.lot_id), normalizedAt]);
    const updated = await client.query(`
      UPDATE rewards_accounts
      SET available_points = available_points - $2,
          updated_at = $3
      WHERE id = $1 AND available_points >= $2
    `, [accountId, removablePoints.toString(), normalizedAt]);
    if (updated.rowCount !== 1) throw new BalanceNormalizationError("legacy_balance_inconsistent");
    return { outcome: "normalized", removedPoints: removablePoints };
  }
}

export class NormalizeTestCustomerBalancesToV2 {
  constructor(
    private readonly candidates: TestBalanceCandidateQuery,
    private readonly adjustments: TestBalanceAdjustment,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(dryRun: boolean): Promise<TestBalanceNormalizationResult> {
    const result: MutableResult = {
      scanned: 0,
      wouldNormalize: 0,
      wouldRemovePoints: 0n,
      normalized: 0,
      alreadyNormalized: 0,
      removedPoints: 0n,
      failures: [],
    };
    for (const candidate of await this.candidates.list()) {
      result.scanned += 1;
      const unsafeCode = candidateFailureCode(candidate);
      if (unsafeCode) {
        result.failures.push({ accountId: candidate.accountId, code: unsafeCode });
        continue;
      }
      if (dryRun) {
        result.wouldNormalize += 1;
        result.wouldRemovePoints += candidate.legacyRemainingPoints;
        continue;
      }
      try {
        const normalized = await this.adjustments.normalize(candidate.accountId, this.now());
        if (normalized.outcome === "normalized") result.normalized += 1;
        else result.alreadyNormalized += 1;
        result.removedPoints += normalized.removedPoints;
      } catch (error) {
        result.failures.push({ accountId: candidate.accountId, code: safeErrorCode(error) });
      }
    }
    return result;
  }
}

interface MutableResult extends Omit<TestBalanceNormalizationResult, "failures"> {
  failures: Array<{ accountId: string; code: string }>;
}

function candidateFailureCode(candidate: TestBalanceCandidate): string | null {
  if (candidate.legacyReservedPoints > 0n) return "legacy_points_reserved";
  if (candidate.availablePoints < candidate.legacyRemainingPoints) return "legacy_balance_inconsistent";
  return null;
}

function safeErrorCode(error: unknown): string {
  return error instanceof BalanceNormalizationError ? error.code : "v2_balance_normalization_failed";
}
