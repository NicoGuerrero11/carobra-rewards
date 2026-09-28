import assert from "node:assert/strict";
import test from "node:test";

import {
  BondaCouponApplication,
  BondaCouponApplicationError,
  type BondaCouponJourney,
  type BondaCouponJourneyQuery,
  type BondaCouponPolicyRecord,
} from "../src/rewards/bonda/catalog-application.js";
import { fakeBondaCoupon, FakeBondaGateway } from "../src/rewards/bonda/fake-gateway.js";
import { BondaGatewayError } from "../src/rewards/bonda/gateway.js";
import type {
  BeginBondaCouponRequestCommand,
  BondaCouponRequestRecord,
  BondaCouponRequestStore,
} from "../src/rewards/bonda/persistence.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import {
  asCustomerId,
  type CatalogItemId,
  type CustomerId,
  type RewardsV2RuleVersionId,
} from "../src/rewards/shared/identifiers.js";
import type { RewardsV2RuleLookupPort, RewardsV2RuleVersion } from "../src/rewards/v2/configuration.js";

const now = new Date("2026-09-10T12:00:00.000Z");
const customerId = asCustomerId("00000000-0000-4000-8000-000000009910");
const identity = { customerId, rewardsId: "RWD-TEST" };
const policies: readonly BondaCouponPolicyRecord[] = [
  policy("bronze", "BRONZE", 1),
  policy("silver", "SILVER", 2),
  policy("gold", "GOLD", 3),
  policy("platinum", "PLATINUM", 4),
  policy("titanium", "TITANIUM", 5),
];

test("home preview is authorized and never provisions affiliates or issues codes", async () => {
  const gateway = new CountingGateway({coupons: policies.map(p => fakeBondaCoupon({id:p.bondaCouponId}))});
  let provisioning = 0;
  let journey: BondaCouponJourney = {state:'ACTIVE',currentLevel:'BRONZE'};
  const create = (affiliate?: string) => new BondaCouponApplication(gateway,{listEffective:async()=>policies},{get:async()=>journey},
    {ensureForBenefits:async()=>{provisioning++;throw Error('must not provision');}},new MemoryRequestStore(),new EnabledRuleLookup(),new FixedClock(now),()=> 'test',undefined,affiliate);
  const app = create('990910001');
  assert.deepEqual((await app.getCatalog(identity,1,4,true)).items.map(item=>item.id),['bronze']);
  for (const state of ['INVITED','BLOCKED','INACTIVE'] as const) {
    journey={state,currentLevel:'TITANIUM'};
    assert.equal((await app.getCatalog(identity,1,4,true)).items.length,0);
  }
  journey={state:'ACTIVE',currentLevel:'BRONZE'};
  assert.equal((await create().getCatalog(identity,1,4,true)).access_state,'AFFILIATE_PENDING');
  assert.equal(provisioning,0);assert.equal(gateway.codeRequests.length,0);
});

test("applies cumulative Carobra policy over live Bonda content", async () => {
  const gateway = new FakeBondaGateway({
    coupons: policies.map((item) => fakeBondaCoupon({ id: item.bondaCouponId, name: item.bondaCouponId })),
  });
  const application = createApplication({ state: "ACTIVE", currentLevel: "SILVER" }, gateway);

  const result = await application.getCatalog(identity);

  assert.equal(result.access_state, "AVAILABLE");
  assert.deepEqual(result.items.map((item) => item.id), ["bronze", "silver"]);
  assert.equal(result.total, 2);
  assert.deepEqual(result.items.map((item) => item.minimumLevel), ["BRONZE", "SILVER"]);
});

test("uses the approved technical affiliate for catalog reads while customer code requests remain gated", async () => {
  const gateway = new CountingGateway({
    coupons: [fakeBondaCoupon({ id: "bronze" })],
  });
  const application = createApplication(
    { state: "ACTIVE", currentLevel: "BRONZE" },
    gateway,
    policies,
    new MemoryRequestStore(),
    { affiliateState: "ACTION_REQUIRED", catalogAffiliateCode: "990910001" },
  );

  const catalog = await application.getCatalog(identity);

  assert.equal(catalog.access_state, "AVAILABLE");
  assert.equal(catalog.affiliate_state, "ACTION_REQUIRED");
  assert.deepEqual(gateway.catalogAffiliateCodes, ["990910001"]);
  await assert.rejects(
    application.requestCode(identity, "bronze", "request-technical-catalog"),
    (error: unknown) => error instanceof BondaCouponApplicationError
      && error.code === "affiliate_pending",
  );
  assert.equal(gateway.codeRequests.length, 0);
});

test("keeps distinct Bonda coupon IDs as separate cards even when the brand repeats", async () => {
  const devlynPolicies = [policy("5850", "SILVER", 1), policy("5849", "SILVER", 2), policy("4749", "SILVER", 3)];
  const gateway = new FakeBondaGateway({
    coupons: [
      fakeBondaCoupon({ id: "5850", name: "Ópticas Devlyn", shortDescription: "10% en clínicas" }),
      fakeBondaCoupon({ id: "5849", name: "Ópticas Devlyn", shortDescription: "15% en aparatos auditivos" }),
      fakeBondaCoupon({ id: "4749", name: "Ópticas Devlyn", shortDescription: "20% en productos ópticos" }),
    ],
  });

  const result = await createApplication(
    { state: "ACTIVE", currentLevel: "SILVER" },
    gateway,
    devlynPolicies,
  ).getCatalog(identity);

  assert.deepEqual(result.items.map((item) => item.id), ["5850", "5849", "4749"]);
  assert.equal(result.items.length, 3);
});

for (const [level, expectedCount] of [
  ["BRONZE", 1],
  ["SILVER", 2],
  ["GOLD", 3],
  ["PLATINUM", 4],
  ["TITANIUM", 5],
] as const) {
  test(`${level} receives its cumulative coupon count`, async () => {
    const gateway = new FakeBondaGateway({
      coupons: policies.map((item) => fakeBondaCoupon({ id: item.bondaCouponId })),
    });
    const result = await createApplication({ state: "ACTIVE", currentLevel: level }, gateway)
      .getCatalog(identity);
    assert.equal(result.items.length, expectedCount);
  });
}

test("Titanio accumulates every approved level while unapproved and expired items stay hidden", async () => {
  const gateway = new FakeBondaGateway({
    coupons: [
      ...policies.map((item) => fakeBondaCoupon({ id: item.bondaCouponId, name: item.bondaCouponId })),
      fakeBondaCoupon({ id: "not-approved", name: "Not approved" }),
      fakeBondaCoupon({ id: "expired", name: "Expired", expirationAt: "2026-01-01T00:00:00.000Z" }),
    ],
  });
  const application = createApplication(
    { state: "ACTIVE", currentLevel: "TITANIUM" },
    gateway,
    [...policies, policy("expired", "BRONZE", 6)],
  );

  assert.deepEqual(
    (await application.getCatalog(identity)).items.map((item) => item.id),
    ["bronze", "silver", "gold", "platinum", "titanium"],
  );
});

for (const journey of [
  { state: "INVITED", currentLevel: null },
  { state: "INACTIVE", currentLevel: "BRONZE" },
  { state: "BLOCKED", currentLevel: "TITANIUM" },
] as const) {
  test(`${journey.state} receives no Bonda coupons`, async () => {
    const gateway = new CountingGateway();
    const result = await createApplication(journey, gateway).getCatalog(identity);
    assert.deepEqual(result.items, []);
    assert.equal(gateway.catalogCalls, 0);
  });
}

test("rejects a higher-level coupon before asking Bonda for a code", async () => {
  const gateway = new CountingGateway({
    coupons: [fakeBondaCoupon({ id: "gold" })],
    affiliateCodes: ["RWD-TEST"],
  });
  const application = createApplication({ state: "ACTIVE", currentLevel: "BRONZE" }, gateway);

  await assert.rejects(
    application.requestCode(identity, "gold", "request-1"),
    (error: unknown) => error instanceof BondaCouponApplicationError
      && error.code === "coupon_unavailable",
  );
  assert.equal(gateway.codeRequests.length, 0);
});

test("loads optional branch information separately from the initial detail", async () => {
  const gateway = new FakeBondaGateway({
    coupons: [fakeBondaCoupon({ id: "bronze" })],
    branches: { bronze: [{ id: "branch-1", name: "Centro", address: "Reforma 100", city: "CDMX", state: null, latitude: 19.43, longitude: -99.16 }] },
  });
  const application = createApplication({ state: "ACTIVE", currentLevel: "BRONZE" }, gateway);
  const result = await application.getDetail(identity, "bronze");
  const branches = await application.getBranches(identity, "bronze");

  assert.deepEqual(result.item?.branches, []);
  assert.equal(branches.items[0]?.name, "Centro");
});

test("audits successful requests without a points dependency", async () => {
  const gateway = new FakeBondaGateway({ coupons: [fakeBondaCoupon({ id: "bronze" })] });
  const requests = new MemoryRequestStore();
  const application = createApplication(
    { state: "ACTIVE", currentLevel: "BRONZE" },
    gateway,
    policies,
    requests,
  );

  const result = await application.requestCode(identity, "bronze", "request-1");

  assert.equal(result.status, "ISSUED");
  assert.equal(result.code, "CAROBRA-bronze");
  assert.equal(requests.records[0]?.status, "ISSUED");
  assert.deepEqual(gateway.codeRequests, [{
    affiliateCode: "RWD-TEST",
    couponId: "bronze",
    externalId: "request-1",
  }]);
});

for (const [gatewayCode, expectedStatus] of [
  ["COUPON_LIMIT_REACHED", "LIMIT_REACHED"],
  ["COUPON_INVENTORY_UNAVAILABLE", "INVENTORY_UNAVAILABLE"],
  ["PARTNER_UNAVAILABLE", "UNAVAILABLE"],
] as const) {
  test(`maps ${gatewayCode} to ${expectedStatus} and persists the safe outcome`, async () => {
    const gateway = new FakeBondaGateway({ coupons: [fakeBondaCoupon({ id: "bronze" })] });
    gateway.requestCouponCode = async () => {
      throw new BondaGatewayError(gatewayCode, "raw partner detail", false);
    };
    const requests = new MemoryRequestStore();
    const result = await createApplication(
      { state: "ACTIVE", currentLevel: "BRONZE" },
      gateway,
      policies,
      requests,
    ).requestCode(identity, "bronze", `request-${expectedStatus}`);

    assert.equal(result.status, expectedStatus);
    assert.equal(requests.records[0]?.status, expectedStatus);
    assert.doesNotMatch(JSON.stringify(requests.records[0]?.safeResultMetadata), /raw partner detail/);
  });
}

test("marks an ambiguous code request for verification and never blind-retries its external id", async () => {
  const gateway = new FakeBondaGateway({ coupons: [fakeBondaCoupon({ id: "bronze" })] });
  gateway.requestCouponCode = async () => {
    throw new BondaGatewayError("AMBIGUOUS_CODE_REQUEST", "unknown", false);
  };
  const requests = new MemoryRequestStore();
  const application = createApplication(
    { state: "ACTIVE", currentLevel: "BRONZE" },
    gateway,
    policies,
    requests,
  );

  assert.equal((await application.requestCode(identity, "bronze", "request-1")).status, "VERIFICATION_REQUIRED");
  assert.equal((await application.requestCode(identity, "bronze", "request-1")).status, "VERIFICATION_REQUIRED");
  assert.equal(requests.records.length, 1);

  gateway.receivedCoupons = [{
    receiptId: "receipt-history-1",
    couponId: "bronze",
    name: "Cinépolis",
    code: "RECOVERED-CODE",
    requestedAt: "2026-09-10T12:00:30.000Z",
  }];
  assert.equal((await application.getHistory(identity)).items[0]?.code, "RECOVERED-CODE");
  assert.equal(requests.records[0]?.status, "ISSUED");
  assert.equal(requests.records[0]?.bondaReceiptId, "receipt-history-1");
});

function createApplication(
  journey: BondaCouponJourney,
  gateway: FakeBondaGateway,
  configuredPolicies = policies,
  requests = new MemoryRequestStore(),
  options: {
    affiliateState?: "ACTIVE" | "PENDING" | "ACTION_REQUIRED";
    catalogAffiliateCode?: string;
  } = {},
): BondaCouponApplication {
  const journeyQuery: BondaCouponJourneyQuery = { get: async () => journey };
  return new BondaCouponApplication(
    gateway,
    { listEffective: async () => configuredPolicies },
    journeyQuery,
    { ensureForBenefits: async () => ({
      state: options.affiliateState ?? "ACTIVE",
      can_request_codes: (options.affiliateState ?? "ACTIVE") === "ACTIVE",
      retry_scheduled: options.affiliateState === "PENDING",
    }) },
    requests,
    new EnabledRuleLookup(),
    new FixedClock(now),
    () => "generated-request",
    undefined,
    options.catalogAffiliateCode,
  );
}

function policy(id: string, minimumLevel: BondaCouponPolicyRecord["minimumLevel"], displayOrder: number): BondaCouponPolicyRecord {
  return {
    catalogItemId: `catalog:${id}` as CatalogItemId,
    bondaCouponId: id,
    minimumLevel,
    displayOrder,
  };
}

class CountingGateway extends FakeBondaGateway {
  catalogCalls = 0;
  catalogAffiliateCodes: string[] = [];

  override async listCoupons(affiliateCode: string) {
    this.catalogCalls += 1;
    this.catalogAffiliateCodes.push(affiliateCode);
    return super.listCoupons(affiliateCode);
  }
}

class EnabledRuleLookup implements RewardsV2RuleLookupPort {
  async findEffective(): Promise<RewardsV2RuleVersion> {
    return {
      id: "rule-bonda" as RewardsV2RuleVersionId,
      ruleType: "FEATURE_FLAG",
      code: "V2_BONDA_COUPONS",
      version: 1,
      enabled: true,
      approvedForProduction: true,
      settings: {},
      effectiveFrom: now,
      effectiveTo: null,
      disabledReason: null,
      approvedAt: now,
      approvedBy: "test",
    };
  }

  async listEffectiveFeatureFlags(): Promise<readonly RewardsV2RuleVersion[]> {
    return [await this.findEffective()];
  }
}

class MemoryRequestStore implements BondaCouponRequestStore {
  readonly records: BondaCouponRequestRecord[] = [];

  async begin(command: BeginBondaCouponRequestCommand) {
    const existing = this.records.find((item) => item.externalId === command.externalId);
    if (existing) return { request: existing, replayed: true };
    const request: BondaCouponRequestRecord = {
      id: `record:${command.externalId}`,
      customerId: command.customerId,
      catalogItemId: command.catalogItemId,
      bondaCouponId: command.bondaCouponId,
      externalId: command.externalId,
      status: "PENDING",
      bondaReceiptId: null,
      safeResultMetadata: {},
      requestedAt: command.requestedAt,
      resolvedAt: null,
    };
    this.records.push(request);
    return { request, replayed: false };
  }

  async resolve(
    requestId: string,
    status: Exclude<BondaCouponRequestRecord["status"], "PENDING">,
    receiptId: string | null,
    metadata: Readonly<Record<string, unknown>>,
    at: Date,
  ): Promise<void> {
    const request = this.records.find((item) => item.id === requestId)!;
    request.status = status;
    request.bondaReceiptId = receiptId;
    request.safeResultMetadata = metadata;
    request.resolvedAt = status === "VERIFICATION_REQUIRED" ? null : at;
  }

  async findByExternalId(externalId: string) {
    return this.records.find((item) => item.externalId === externalId) ?? null;
  }

  async listVerificationRequired(_limit: number) {
    return this.records.filter((item) => item.status === "VERIFICATION_REQUIRED");
  }

  async listVerificationRequiredForCustomer(customer: CustomerId, _limit: number) {
    return this.records.filter((item) => item.customerId === customer
      && item.status === "VERIFICATION_REQUIRED");
  }
}
