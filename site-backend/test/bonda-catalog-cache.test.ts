import assert from "node:assert/strict";
import test from "node:test";

import { BondaCatalogCache } from "../src/rewards/bonda/catalog-cache.js";
import { fakeBondaCoupon } from "../src/rewards/bonda/fake-gateway.js";
import { BondaGatewayError } from "../src/rewards/bonda/gateway.js";
import type { Clock } from "../src/rewards/shared/clock.js";

test("reuses a fresh Bonda catalog and preserves its refresh time", async () => {
  const clock = new MutableClock("2026-09-10T12:00:00.000Z");
  let calls = 0;
  const cache = new BondaCatalogCache({
    listCoupons: async () => {
      calls += 1;
      return [fakeBondaCoupon()];
    },
  }, clock, 60_000, 300_000);

  const first = await cache.read("affiliate-1");
  clock.advance(30_000);
  const second = await cache.read("affiliate-1");

  assert.equal(calls, 1);
  assert.equal(second, first);
  assert.equal(second.refreshedAt.toISOString(), "2026-09-10T12:00:00.000Z");
});

test("serves a bounded stale catalog only for retryable partner failures", async () => {
  const clock = new MutableClock("2026-09-10T12:00:00.000Z");
  let unavailable = false;
  const cache = new BondaCatalogCache({
    listCoupons: async () => {
      if (unavailable) throw new BondaGatewayError("PARTNER_UNAVAILABLE", "temporary", true);
      return [fakeBondaCoupon({ id: "cached" })];
    },
  }, clock, 60_000, 300_000);

  const first = await cache.read("affiliate-1");
  unavailable = true;
  clock.advance(60_001);
  const stale = await cache.read("affiliate-1");

  assert.equal(stale, first);
  assert.equal(stale.items[0]?.id, "cached");

  clock.advance(240_000);
  await assert.rejects(
    cache.read("affiliate-1"),
    (error: unknown) => error instanceof BondaGatewayError
      && error.code === "PARTNER_UNAVAILABLE",
  );
});

test("does not hide authentication failures behind stale catalog data", async () => {
  const clock = new MutableClock("2026-09-10T12:00:00.000Z");
  let unauthorized = false;
  const cache = new BondaCatalogCache({
    listCoupons: async () => {
      if (unauthorized) throw new BondaGatewayError("UNAUTHORIZED", "invalid key", false);
      return [fakeBondaCoupon()];
    },
  }, clock, 1_000, 300_000);

  await cache.read("affiliate-1");
  unauthorized = true;
  clock.advance(1_001);

  await assert.rejects(
    cache.read("affiliate-1"),
    (error: unknown) => error instanceof BondaGatewayError
      && error.code === "UNAUTHORIZED",
  );
});

class MutableClock implements Clock {
  private value: Date;

  constructor(value: string) {
    this.value = new Date(value);
  }

  now(): Date {
    return new Date(this.value.getTime());
  }

  advance(milliseconds: number): void {
    this.value = new Date(this.value.getTime() + milliseconds);
  }
}
