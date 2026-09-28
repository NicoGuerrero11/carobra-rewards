import assert from "node:assert/strict";
import test from "node:test";

import { BondaAffiliateProvisioningApplication } from "../src/rewards/bonda/affiliate-provisioning.js";
import { FakeBondaGateway } from "../src/rewards/bonda/fake-gateway.js";
import { BondaGatewayError } from "../src/rewards/bonda/gateway.js";
import type {
  BondaAffiliateFailureCode,
  BondaAffiliateProvisioningRecord,
  BondaAffiliateProvisioningStore,
} from "../src/rewards/bonda/persistence.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import { asCustomerId, type CustomerId } from "../src/rewards/shared/identifiers.js";

const customerId = asCustomerId("00000000-0000-4000-8000-000000009901");
const now = new Date("2026-09-10T12:00:00.000Z");

test("provisions an affiliate with Rewards ID and converges existing affiliates", async () => {
  const store = new MemoryAffiliateStore();
  const gateway = new FakeBondaGateway();
  const application = createApplication(store, gateway);

  assert.deepEqual(await application.afterRegistration({ customerId, rewardsId: "RWD-TEST" }), {
    state: "ACTIVE",
    can_request_codes: true,
    retry_scheduled: false,
  });
  assert.equal(gateway.affiliateCodes.has("RWD-TEST"), true);

  store.records.get(customerId)!.state = "PENDING";
  store.records.get(customerId)!.nextAttemptAt = null;
  assert.equal((await application.ensureForBenefits({ customerId, rewardsId: "RWD-TEST" })).state, "ACTIVE");
});

test("keeps registration successful and schedules bounded retry after Bonda timeout", async () => {
  const store = new MemoryAffiliateStore();
  const gateway = new FakeBondaGateway();
  gateway.affiliateExists = async () => {
    throw new BondaGatewayError("PARTNER_UNAVAILABLE", "unavailable", true);
  };
  const application = createApplication(store, gateway);

  const result = await application.afterRegistration({ customerId, rewardsId: "RWD-TEST" });

  assert.equal(result.state, "PENDING");
  assert.equal(result.retry_scheduled, true);
  assert.equal(store.records.get(customerId)?.safeErrorCode, "partner_unavailable");
  assert.equal(store.records.get(customerId)?.nextAttemptAt?.toISOString(), "2026-09-10T12:00:30.000Z");
});

test("invalid partner credentials stop automatic retries without breaking registration", async () => {
  const store = new MemoryAffiliateStore();
  const gateway = new FakeBondaGateway();
  gateway.affiliateExists = async () => {
    throw new BondaGatewayError("UNAUTHORIZED", "rejected", false);
  };

  const result = await createApplication(store, gateway).afterRegistration({
    customerId,
    rewardsId: "RWD-TEST",
  });

  assert.equal(result.state, "ACTION_REQUIRED");
  assert.equal(result.retry_scheduled, false);
  assert.equal(store.records.get(customerId)?.safeErrorCode, "invalid_credentials");
});

test("disabled provisioning makes no Bonda or persistence call", async () => {
  const store = new MemoryAffiliateStore();
  const gateway = new FakeBondaGateway();
  const result = await new BondaAffiliateProvisioningApplication(
    false,
    store,
    gateway,
    new FixedClock(now),
  ).afterRegistration({ customerId, rewardsId: "RWD-TEST" });

  assert.equal(result.state, "DISABLED");
  assert.equal(store.records.size, 0);
  assert.equal(gateway.affiliateCodes.size, 0);
});

test("lazy benefits access repairs a missing local record", async () => {
  const store = new MemoryAffiliateStore();
  const gateway = new FakeBondaGateway({ affiliateCodes: ["RWD-TEST"] });

  const result = await createApplication(store, gateway).ensureForBenefits({
    customerId,
    rewardsId: "RWD-TEST",
  });

  assert.equal(result.state, "ACTIVE");
  assert.equal(store.records.get(customerId)?.state, "ACTIVE");
});

test("a local failure after partner creation remains repairable without duplicate affiliate", async () => {
  const store = new MemoryAffiliateStore();
  store.failNextMarkActive = true;
  const gateway = new FakeBondaGateway();
  const application = createApplication(store, gateway);

  assert.equal((await application.afterRegistration({ customerId, rewardsId: "RWD-TEST" })).state, "PENDING");
  assert.equal(gateway.affiliateCodes.size, 1);
  store.records.get(customerId)!.nextAttemptAt = null;

  assert.equal((await application.ensureForBenefits({ customerId, rewardsId: "RWD-TEST" })).state, "ACTIVE");
  assert.equal(gateway.affiliateCodes.size, 1);
});

function createApplication(store: MemoryAffiliateStore, gateway: FakeBondaGateway) {
  return new BondaAffiliateProvisioningApplication(
    true,
    store,
    gateway,
    new FixedClock(now),
  );
}

class MemoryAffiliateStore implements BondaAffiliateProvisioningStore {
  readonly records = new Map<CustomerId, BondaAffiliateProvisioningRecord>();
  failNextMarkActive = false;

  async ensurePending(customer: CustomerId, rewardsId: string): Promise<BondaAffiliateProvisioningRecord> {
    const existing = this.records.get(customer);
    if (existing) {
      if (existing.rewardsId !== rewardsId) throw new Error("Rewards ID conflict");
      return existing;
    }
    const record: BondaAffiliateProvisioningRecord = {
      customerId: customer,
      rewardsId,
      state: "PENDING",
      externalMemberId: null,
      attemptCount: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      safeErrorCode: null,
    };
    this.records.set(customer, record);
    return record;
  }

  async find(customer: CustomerId): Promise<BondaAffiliateProvisioningRecord | null> {
    return this.records.get(customer) ?? null;
  }

  async claimCustomer(customer: CustomerId, at: Date): Promise<BondaAffiliateProvisioningRecord | null> {
    const record = this.records.get(customer);
    if (!record || record.state !== "PENDING" || (record.nextAttemptAt && record.nextAttemptAt > at)) {
      return null;
    }
    record.attemptCount += 1;
    record.lastAttemptAt = at;
    record.nextAttemptAt = new Date(at.getTime() + 5 * 60_000);
    return record;
  }

  async claimDue(at: Date, limit: number): Promise<readonly BondaAffiliateProvisioningRecord[]> {
    const due: BondaAffiliateProvisioningRecord[] = [];
    for (const record of this.records.values()) {
      if (due.length >= limit) break;
      const claimed = await this.claimCustomer(record.customerId, at);
      if (claimed) due.push(claimed);
    }
    return due;
  }

  async markActive(customer: CustomerId, externalMemberId: string | null): Promise<void> {
    if (this.failNextMarkActive) {
      this.failNextMarkActive = false;
      throw new Error("local write failed");
    }
    const record = this.require(customer);
    record.state = "ACTIVE";
    record.externalMemberId = externalMemberId;
    record.nextAttemptAt = null;
    record.safeErrorCode = null;
  }

  async markFailure(
    customer: CustomerId,
    code: BondaAffiliateFailureCode,
    retryAt: Date | null,
  ): Promise<void> {
    const record = this.require(customer);
    record.state = retryAt ? "PENDING" : "ACTION_REQUIRED";
    record.safeErrorCode = code;
    record.nextAttemptAt = retryAt;
  }

  private require(customer: CustomerId): BondaAffiliateProvisioningRecord {
    const record = this.records.get(customer);
    if (!record) throw new Error("missing record");
    return record;
  }
}
