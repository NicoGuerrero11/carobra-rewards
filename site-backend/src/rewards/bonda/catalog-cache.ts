import type { Clock } from "../shared/clock.js";
import type { BondaCouponDetail } from "./contracts.js";
import type { BondaGateway } from "./gateway.js";
import { BondaGatewayError } from "./gateway.js";

export interface BondaCatalogSnapshot {
  items: readonly BondaCouponDetail[];
  refreshedAt: Date;
}

export interface BondaCatalogReader {
  read(affiliateCode: string): Promise<BondaCatalogSnapshot>;
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

  constructor(
    private readonly gateway: Pick<BondaGateway, "listCoupons">,
    private readonly clock: Clock,
    private readonly ttlMs: number,
    private readonly maxStaleMs: number,
  ) {}

  async read(affiliateCode: string): Promise<BondaCatalogSnapshot> {
    const now = this.clock.now().getTime();
    const cached = this.entries.get(affiliateCode);
    if (cached && now < cached.freshUntil) return cached.snapshot;

    const pending = this.inFlight.get(affiliateCode);
    if (pending) return pending;

    const refresh = this.refresh(affiliateCode, cached, now);
    this.inFlight.set(affiliateCode, refresh);
    try {
      return await refresh;
    } finally {
      if (this.inFlight.get(affiliateCode) === refresh) {
        this.inFlight.delete(affiliateCode);
      }
    }
  }

  private async refresh(
    affiliateCode: string,
    cached: CachedCatalog | undefined,
    now: number,
  ): Promise<BondaCatalogSnapshot> {
    try {
      const items = await this.gateway.listCoupons(affiliateCode);
      const refreshedAt = this.clock.now();
      const snapshot = { items: [...items], refreshedAt };
      this.entries.set(affiliateCode, {
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
}
