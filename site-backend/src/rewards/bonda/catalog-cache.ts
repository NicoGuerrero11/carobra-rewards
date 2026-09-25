import type { Clock } from "../shared/clock.js";
import type { BondaCouponBranch, BondaCouponDetail } from "./contracts.js";
import type { BondaGateway } from "./gateway.js";
import { BondaGatewayError } from "./gateway.js";

export interface BondaCatalogSnapshot {
  items: readonly BondaCouponDetail[];
  refreshedAt: Date;
}

export interface BondaCatalogReader {
  read(affiliateCode: string, approvedCouponIds?: readonly string[]): Promise<BondaCatalogSnapshot>;
  readBranches(affiliateCode: string, couponId: string): Promise<readonly BondaCouponBranch[]>;
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

    const refresh = this.refresh(cacheKey, affiliateCode, normalizedIds, cached, now);
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
    now: number,
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
      return snapshot;
    } catch (error) {
      if (
        cached
        && now <= cached.staleUntil
        && error instanceof BondaGatewayError
        && error.retryable
      ) {
        return cached.snapshot;
      }
      throw error;
    }
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

async function loadApprovedCoupons(
  getCoupon: BondaGateway["getCoupon"],
  affiliateCode: string,
  couponIds: readonly string[],
): Promise<readonly BondaCouponDetail[]> {
  const items: Array<BondaCouponDetail | null> = new Array(couponIds.length).fill(null);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(MAX_PARALLEL_COUPON_READS, couponIds.length) },
    async () => {
      while (nextIndex < couponIds.length) {
        const index = nextIndex;
        nextIndex += 1;
        items[index] = await getCoupon(affiliateCode, couponIds[index]!);
      }
    },
  );
  await Promise.all(workers);
  return items.filter((item): item is BondaCouponDetail => item !== null);
}

function catalogCacheKey(affiliateCode: string, couponIds: readonly string[]): string {
  return `${affiliateCode}\u0000${couponIds.join(",")}`;
}
