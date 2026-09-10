import assert from "node:assert/strict";
import test from "node:test";

import { fakeBondaCoupon, FakeBondaGateway } from "../src/rewards/bonda/fake-gateway.js";
import {
  ReconcileBondaCatalog,
  type BondaCatalogPolicyCandidate,
} from "../src/rewards/bonda/reconciliation.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import type { CatalogItemId } from "../src/rewards/shared/identifiers.js";

const now = new Date("2026-09-10T12:00:00.000Z");

test("reconciliation proposes exact normalized matches without publishing them", async () => {
  const candidates = [
    candidate("Ópticas Devlyn"),
    candidate("Duplicada", "candidate-2"),
    candidate("No existe", "candidate-3"),
    candidate("Expirado", "candidate-4"),
  ];
  const gateway = new FakeBondaGateway({ coupons: [
    fakeBondaCoupon({ id: "bonda-1", name: "Opticas Devlyn" }),
    fakeBondaCoupon({ id: "bonda-2", name: "Duplicada" }),
    fakeBondaCoupon({ id: "bonda-3", name: "Duplicada" }),
    fakeBondaCoupon({ id: "bonda-4", name: "Expirado", expirationAt: "2026-01-01T00:00:00.000Z" }),
  ] });

  const report = await new ReconcileBondaCatalog(
    { list: async () => candidates },
    gateway,
    new FixedClock(now),
  ).run("RWD-TEST");

  assert.deepEqual(report.items.map((item) => item.state), [
    "PROPOSED_MATCH",
    "DUPLICATE_NAME",
    "MISSING",
    "EXPIRED",
  ]);
  assert.equal(candidates.every((item) => item.bondaCouponId === null && !item.enabled), true);
});

test("reconciliation flags removed and renamed published Bonda coupons", async () => {
  const gateway = new FakeBondaGateway({ coupons: [
    fakeBondaCoupon({ id: "renamed-id", name: "Nombre nuevo" }),
  ] });
  const report = await new ReconcileBondaCatalog(
    { list: async () => [
      { ...candidate("Nombre anterior"), bondaCouponId: "renamed-id", enabled: true },
      { ...candidate("Removido", "candidate-2"), bondaCouponId: "missing-id", enabled: true },
    ] },
    gateway,
    new FixedClock(now),
  ).run("RWD-TEST");

  assert.deepEqual(report.items.map((item) => item.state), ["CONTENT_CHANGED", "MISSING"]);
});

function candidate(name: string, id = "candidate-1"): BondaCatalogPolicyCandidate {
  return {
    catalogItemId: id as CatalogItemId,
    code: id,
    name,
    description: "Candidate",
    bondaCouponId: null,
    enabled: false,
    minimumLevel: "BRONZE",
    displayOrder: 1,
  };
}
