import type { Clock } from "../shared/clock.js";
import type { BondaCouponBranch, BondaCouponDetail } from "./contracts.js";
import type { BondaGateway } from "./gateway.js";
import { BondaGatewayError } from "./gateway.js";

export interface BondaCatalogSnapshot {
  items: readonly BondaCouponDetail[];
  refreshedAt: Date;
  freshness?: "FRESH" | "STALE";
}

export interface BondaCatalogReader {
  read(affiliateCode: string, approvedCouponIds?: readonly string[]): Promise<BondaCatalogSnapshot>;
  readBranches(affiliateCode: string, couponId: string): Promise<readonly BondaCouponBranch[]>;
}

/** Deliberately excludes request URLs, identity, credentials and partner payloads. */
export interface BondaCatalogRefreshEvent {
  event: "bonda_catalog_refresh";
  at: string;
  outcome: "SUCCESS" | "STALE" | "UNAVAILABLE";
  approved_count: number;
  item_count: number | null;
  last_validated_at: string | null;
  error_code: BondaGatewayError["code"] | "UNEXPECTED_ERROR" | null;
}

interface CachedCatalog {
  snapshot: BondaCatalogSnapshot;
  freshUntil: number;
  staleUntil: number;
}

/**
 * Keeps only validated, public catalog metadata. Code requests and customer
 * history always continue through the live gateway.
 */
export class BondaCatalogCache implements BondaCatalogReader {
  private readonly entries = new Map<string, CachedCatalog>();
  private readonly inFlight = new Map<string, Promise<BondaCatalogSnapshot>>();
  private readonly branchEntries = new Map<string, {
    items: readonly BondaCouponBranch[];
    freshUntil: number;
    staleUntil: number;
  }>();
  private readonly branchInFlight = new Map<string, Promise<readonly BondaCouponBranch[]>>();

  constructor(
    private readonly gateway: Pick<BondaGateway, "listCoupons">
      & Partial<Pick<BondaGateway, "getCoupon" | "listCouponBranches">>,
    private readonly clock: Clock,
    private readonly ttlMs: number,
    private readonly maxStaleMs: number,
    private readonly observe?: (event: BondaCatalogRefreshEvent) => void,
  ) {}

  async read(
    affiliateCode: string,
    approvedCouponIds: readonly string[] = [],
  ): Promise<BondaCatalogSnapshot> {
    const now = this.clock.now().getTime();
    const normalizedIds = [...new Set(approvedCouponIds)].sort();
    const cacheKey = catalogCacheKey(affiliateCode, normalizedIds);
    const cached = this.entries.get(cacheKey);
    if (cached && now < cached.freshUntil) return cached.snapshot;

    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending;

    const refresh = this.refresh(cacheKey, affiliateCode, normalizedIds, cached);
    this.inFlight.set(cacheKey, refresh);
    try {
      return await refresh;
    } finally {
      if (this.inFlight.get(cacheKey) === refresh) {
        this.inFlight.delete(cacheKey);
      }
    }
  }

  async readBranches(
    affiliateCode: string,
    couponId: string,
  ): Promise<readonly BondaCouponBranch[]> {
    const cacheKey = `${affiliateCode}\u0000${couponId}`;
    const now = this.clock.now().getTime();
    const cached = this.branchEntries.get(cacheKey);
    if (cached && now < cached.freshUntil) return cached.items;

    const pending = this.branchInFlight.get(cacheKey);
    if (pending) return pending;

    const refresh = this.refreshBranches(cacheKey, affiliateCode, couponId, cached, now);
    this.branchInFlight.set(cacheKey, refresh);
    try {
      return await refresh;
    } finally {
      if (this.branchInFlight.get(cacheKey) === refresh) this.branchInFlight.delete(cacheKey);
    }
  }

  private async refresh(
    cacheKey: string,
    affiliateCode: string,
    approvedCouponIds: readonly string[],
    cached: CachedCatalog | undefined,
  ): Promise<BondaCatalogSnapshot> {
    try {
      const items = approvedCouponIds.length > 0 && this.gateway.getCoupon
        ? await loadApprovedCoupons(this.gateway.getCoupon.bind(this.gateway), affiliateCode, approvedCouponIds)
        : await this.gateway.listCoupons(affiliateCode);
      const refreshedAt = this.clock.now();
      const snapshot = { items: [...items], refreshedAt };
      this.entries.set(cacheKey, {
        snapshot,
        freshUntil: refreshedAt.getTime() + this.ttlMs,
        staleUntil: refreshedAt.getTime() + this.maxStaleMs,
      });
      this.report("SUCCESS", approvedCouponIds.length, snapshot, null);
      return snapshot;
    } catch (error) {
      // A partial refresh may positively confirm removals before another read
      // fails. Never reintroduce those offers through the stale fallback.
      if (cached && error instanceof ApprovedCouponReadError && error.removedIds.length) {
        cached.snapshot = { ...cached.snapshot, items: cached.snapshot.items.filter(item => !error.removedIds.includes(item.id)) };
      }
      if (
        cached
        && this.clock.now().getTime() <= cached.staleUntil
        && error instanceof BondaGatewayError
        && (error.retryable || error.code === "INVALID_RESPONSE")
      ) {
        this.report("STALE", approvedCouponIds.length, cached.snapshot, error);
        return { ...cached.snapshot, freshness: "STALE" };
      }
      this.report("UNAVAILABLE", approvedCouponIds.length, cached?.snapshot, error);
      throw error;
    }
  }

  private report(
    outcome: BondaCatalogRefreshEvent["outcome"],
    approvedCount: number,
    snapshot: BondaCatalogSnapshot | undefined,
    error: unknown,
  ): void {
    try {
      this.observe?.({
        event: "bonda_catalog_refresh", at: this.clock.now().toISOString(), outcome,
        approved_count: approvedCount, item_count: snapshot?.items.length ?? null,
        last_validated_at: snapshot?.refreshedAt.toISOString() ?? null,
        error_code: error === null ? null : error instanceof BondaGatewayError ? error.code : "UNEXPECTED_ERROR",
      });
    } catch { /* Observability must never change catalog availability. */ }
  }

  private async refreshBranches(
    cacheKey: string,
    affiliateCode: string,
    couponId: string,
    cached: { items: readonly BondaCouponBranch[]; freshUntil: number; staleUntil: number } | undefined,
    now: number,
  ): Promise<readonly BondaCouponBranch[]> {
    try {
      if (!this.gateway.listCouponBranches) return [];
      const items = [...await this.gateway.listCouponBranches(affiliateCode, couponId)];
      const refreshedAt = this.clock.now().getTime();
      this.branchEntries.set(cacheKey, {
        items,
        freshUntil: refreshedAt + this.ttlMs,
        staleUntil: refreshedAt + this.maxStaleMs,
      });
      return items;
    } catch (error) {
      if (cached && now <= cached.staleUntil && error instanceof BondaGatewayError && error.retryable) {
        return cached.items;
      }
      throw error;
    }
  }
}

const MAX_PARALLEL_COUPON_READS = 8;

class ApprovedCouponReadError extends BondaGatewayError {
  constructor(error: BondaGatewayError, readonly removedIds: readonly string[]) {
    super(error.code, error.message, error.retryable);
  }
}

async function loadApprovedCoupons(
  getCoupon: BondaGateway["getCoupon"],
  affiliateCode: string,
  couponIds: readonly string[],
): Promise<readonly BondaCouponDetail[]> {
  const items: Array<BondaCouponDetail | null> = new Array(couponIds.length).fill(null);
  let nextIndex = 0;
  const failures: unknown[] = [];
  const removedIds: string[] = [];
  const workers = Array.from(
    { length: Math.min(MAX_PARALLEL_COUPON_READS, couponIds.length) },
    async () => {
      while (nextIndex < couponIds.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          items[index] = await getCoupon(affiliateCode, couponIds[index]!);
          if (items[index] === null) removedIds.push(couponIds[index]!);
        } catch (error) {
          failures.push(error);
        }
      }
    },
  );
  await Promise.all(workers);
  if (failures.length) {
    // Authentication/configuration failures must not be hidden by another
    // concurrent, retryable failure.
    const failure = failures.find(error => !(error instanceof BondaGatewayError)
      || (!error.retryable && error.code !== "INVALID_RESPONSE")) ?? failures[0];
    if (failure instanceof BondaGatewayError) throw new ApprovedCouponReadError(failure, removedIds);
    throw failure;
  }
  return items.filter((item): item is BondaCouponDetail => item !== null);
}

function catalogCacheKey(affiliateCode: string, couponIds: readonly string[]): string {
  return `${affiliateCode}\u0000${couponIds.join(",")}`;
}
