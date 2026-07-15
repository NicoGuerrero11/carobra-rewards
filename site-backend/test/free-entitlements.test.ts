import assert from "node:assert/strict";
import test from "node:test";

import {
  ManageFreeEntitlements,
  type FreeEntitlementPort,
  type FreeEntitlementResult,
  type GrantFreeEntitlementCommand,
  type UseFreeEntitlementCommand,
} from "../src/rewards/catalog/entitlements.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import type {
  CatalogItemId,
  EntitlementId,
  RewardsAccountId,
} from "../src/rewards/shared/identifiers.js";

const now = new Date("2026-07-14T17:00:00.000Z");
const grant: GrantFreeEntitlementCommand = {
  accountId: "00000000-0000-4000-8000-000000006001" as RewardsAccountId,
  catalogItemId: "00000000-0000-4000-8000-000000006002" as CatalogItemId,
  rewardEventId: null,
  idempotencyKey: "entitlement-grant-1",
  expiresAt: new Date("2026-08-14T17:00:00.000Z"),
  safeMetadata: { source: "onboarding" },
};

test("free entitlement grant and use receive authoritative application times", async () => {
  const port = new CapturingEntitlementPort();
  const service = new ManageFreeEntitlements(port, new FixedClock(now));
  await service.grant(grant);
  assert.deepEqual(port.granted, { ...grant, grantedAt: now });
  const use: UseFreeEntitlementCommand = {
    accountId: grant.accountId,
    entitlementId: "00000000-0000-4000-8000-000000006003" as EntitlementId,
    idempotencyKey: "entitlement-use-1",
  };
  await service.use(use);
  assert.deepEqual(port.used, { ...use, usedAt: now });
});

test("free entitlement grant rejects already expired benefits before persistence", () => {
  const port = new CapturingEntitlementPort();
  assert.throws(
    () => new ManageFreeEntitlements(port, new FixedClock(now)).grant({
      ...grant,
      expiresAt: now,
    }),
    /expiration must be after grant time/,
  );
  assert.equal(port.granted, null);
});

class CapturingEntitlementPort implements FreeEntitlementPort {
  granted: (GrantFreeEntitlementCommand & { grantedAt: Date }) | null = null;
  used: (UseFreeEntitlementCommand & { usedAt: Date }) | null = null;

  async grant(
    command: GrantFreeEntitlementCommand & { grantedAt: Date },
  ): Promise<FreeEntitlementResult> {
    this.granted = command;
    return {
      entitlementId: "00000000-0000-4000-8000-000000006003" as EntitlementId,
      status: "AVAILABLE",
      replayed: false,
    };
  }

  async use(
    command: UseFreeEntitlementCommand & { usedAt: Date },
  ): Promise<FreeEntitlementResult> {
    this.used = command;
    return { entitlementId: command.entitlementId, status: "USED", replayed: false };
  }
}
