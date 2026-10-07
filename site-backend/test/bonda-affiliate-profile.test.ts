import assert from "node:assert/strict";
import test from "node:test";
import type { BondaConfig } from "../src/config.js";
import {
  BondaAffiliateProfileSyncApplication, pendingAffiliateProfileContract,
  type AffiliateProfileCheckpoint, type AffiliateProfileContract, type AffiliateProfileSyncInput,
  type AffiliateProfileSyncStore,
} from "../src/rewards/bonda/affiliate-profile.js";
import { BondaHttpGateway } from "../src/rewards/bonda/http-gateway.js";

// Hypothetical confirmed contract for synthetic tests only; never installed in runtime config.
const confirmed: AffiliateProfileContract = { curpTextAccepted: true, patchFields: ["email", "nombre", "apellido", "curp"] };
const config: BondaConfig = {
  baseUrl: "https://bonda.example.test", allowedHosts: ["bonda.example.test"], allowedImageHosts: [],
  micrositeId: "synthetic-site", affiliateToken: "synthetic-token", requestTimeoutMs: 1000,
  catalogCacheTtlMs: 1000, catalogCacheMaxStaleMs: 1000, catalogEnabled: false,
  affiliateProvisioningEnabled: true, couponRequestsEnabled: false,
};
const fields = { email: "synthetic@example.test", nombre: "Cliente", apellido: "Sintético", curp: "ABCD123456HMNLRS09" };
const input: AffiliateProfileSyncInput = {
  customer: { id: "synthetic-customer", rewards_id: "123456789", curp: fields.curp, email: fields.email,
    first_name: fields.nombre, last_name: fields.apellido, phone: "", postal_code: "", state: "", city: "",
    customer_status: "ACTIVE", onboarding_status: "COMPLETED" },
  journey: { state: "ACTIVE", currentLevel: "GOLD" }, affiliate: "ABSENT_CONFIRMED",
};
const ack = () => Response.json({ success: true, data: { member: { code: input.customer.rewards_id } } });
class MemoryStore implements AffiliateProfileSyncStore {
  records = new Map<string, AffiliateProfileCheckpoint>();
  locked = new Set<string>();
  claims = 0;
  failIntent = false;
  failAcknowledgement = false;
  async claim(id: string) { this.claims++; if (this.locked.has(id)) return false; this.locked.add(id); return true; }
  async read(id: string) { return this.records.get(id) ?? null; }
  async write(id: string, checkpoint: AffiliateProfileCheckpoint) {
    if (this.failIntent || (this.failAcknowledgement && checkpoint.status === "SYNCHRONIZED")) throw Error("synthetic database failure");
    this.records.set(id, checkpoint);
  }
  async release(id: string) { this.locked.delete(id); }
}
function setup(fetcher: typeof fetch = async () => ack(), contract = confirmed, enabled = true) {
  const store = new MemoryStore();
  const gateway = new BondaHttpGateway(config, fetcher, contract);
  const app = new BondaAffiliateProfileSyncApplication(enabled, contract, gateway, store, "synthetic-revision-key-for-local-tests-only");
  return { store, gateway, app };
}

test("profile synchronization defaults to pending and never calls transport or store", async () => {
  let calls = 0;
  const pending = setup(async () => { calls++; return ack(); }, pendingAffiliateProfileContract);
  assert.deepEqual(await pending.app.synchronize(input), { status: "CONTRACT_PENDING" });
  assert.equal(pending.store.claims, 0); assert.equal(calls, 0);
  const disabled = setup(async () => { calls++; return ack(); }, confirmed, false);
  assert.deepEqual(await disabled.app.synchronize(input), { status: "DISABLED" });
  const gateway = new BondaHttpGateway(config, async () => { calls++; return ack(); });
  await assert.rejects(gateway.createAffiliateProfile("123456789", fields), /pending confirmation/);
  await assert.rejects(gateway.updateAffiliateProfile("123456789", { email: fields.email }), /pending confirmation/);
  assert.equal(calls, 0);
});

test("only active Gold and above can share profile; account and affiliate uncertainty fail closed", async () => {
  for (const level of [null, "BRONZE", "SILVER", "UNKNOWN"]) {
    const { app, store } = setup();
    assert.equal((await app.synchronize({ ...input, journey: { state: "ACTIVE", currentLevel: level } })).status, "NOT_ELIGIBLE");
    assert.equal(store.claims, 0);
  }
  for (const state of ["INVITED", "INACTIVE", "BLOCKED"]) {
    assert.equal((await setup().app.synchronize({ ...input, journey: { state, currentLevel: "GOLD" } })).status, "NOT_ELIGIBLE");
  }
  assert.equal((await setup().app.synchronize({ ...input, journey: null })).status, "NOT_ELIGIBLE");
  assert.equal((await setup().app.synchronize({ ...input, customer: { ...input.customer, customer_status: "INACTIVE" } })).status, "NOT_ELIGIBLE");
  assert.equal((await setup().app.synchronize({ ...input, affiliate: "UNKNOWN" })).status, "AFFILIATE_REVIEW_REQUIRED");
  for (const level of ["GOLD", "PLATINUM", "TITANIUM"]) {
    assert.equal((await setup().app.synchronize({ ...input, journey: { state: "ACTIVE", currentLevel: level } })).status, "SYNCHRONIZED");
  }
});

test("create uses API code and reference slugs as top-level strings; never credentials, segmentation or import ID", async () => {
  let count = 0;
  const { app, store } = setup(async (url, init) => {
    count++;
    assert.equal(String(url), "https://bonda.example.test/api/v2/microsite/synthetic-site/affiliates");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("token"), "synthetic-token");
    assert.deepEqual(JSON.parse(String(init?.body)), { code: "123456789", ...fields, send_welcome_email: false });
    return ack();
  });
  assert.equal((await app.synchronize(input)).status, "SYNCHRONIZED");
  assert.deepEqual(await app.synchronize(input), { status: "SYNCHRONIZED", changedFields: [] });
  assert.equal(count, 1);
  const metadata = JSON.stringify([...store.records.values()]);
  for (const value of Object.values(fields)) assert.ok(!metadata.includes(value));
});

test("existing affiliate is updated without creating; subsequent PATCH sends only changed fields", async () => {
  const bodies: unknown[] = [];
  const { app } = setup(async (url, init) => {
    assert.equal(init?.method, "PATCH");
    assert.equal(init?.redirect, "error");
    assert.equal(new URL(String(url)).pathname, "/api/v2/microsite/synthetic-site/affiliates/123456789");
    bodies.push(JSON.parse(String(init?.body))); return ack();
  });
  const existing = { ...input, affiliate: "EXISTING_CONFIRMED" as const };
  await app.synchronize(existing);
  await app.synchronize(existing);
  await app.synchronize({ ...existing, customer: { ...input.customer, email: "changed@example.test" } });
  assert.deepEqual(bodies, [fields, { email: "changed@example.test" }]);
});

test("CURP corrections preserve text and stable affiliate code", async () => {
  const bodies: unknown[] = [];
  const { app } = setup(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return ack(); });
  await app.synchronize(input);
  const corrected = "WXYZ123456HMNLRS09";
  await app.synchronize({ ...input, affiliate: "EXISTING_CONFIRMED", customer: { ...input.customer, curp: corrected } });
  assert.deepEqual(bodies[1], { curp: corrected });
  assert.equal((await app.synchronize({ ...input, customer: { ...input.customer, rewards_id: "987654321" } })).status, "IDENTITY_CONFLICT");
});

test("unsupported PATCH fields, malformed identity and unknown payload properties cannot be sent", async () => {
  let calls = 0;
  const { app, gateway } = setup(async () => { calls++; return ack(); });
  for (const rewards_id of ["RWD-legacy", "123 456 789", "012345678", ""]) {
    assert.equal((await app.synchronize({ ...input, customer: { ...input.customer, rewards_id } })).status, "IDENTITY_INVALID");
  }
  assert.equal((await app.synchronize({ ...input, customer: { ...input.customer, curp: "123456" } })).status, "IDENTITY_INVALID");
  await assert.rejects(gateway.updateAffiliateProfile("123456789", { ...fields, code: "987654321" } as typeof fields), /invalid_affiliate_profile_fields/);
  await assert.rejects(gateway.updateAffiliateProfile("123456789", { ...fields, contrasena: "not-allowed" } as typeof fields), /invalid_affiliate_profile_fields/);
  const restricted = setup(async () => { calls++; return ack(); }, { curpTextAccepted: true, patchFields: ["email"] });
  assert.equal((await restricted.app.synchronize(input)).status, "CONTRACT_PENDING");
  await assert.rejects(restricted.gateway.updateAffiliateProfile("123456789", { curp: fields.curp }), /pending confirmation/);
  assert.equal(calls, 0);
});

test("simultaneous synchronization claims once and repeated input never duplicates dispatch", async () => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  let calls = 0;
  const { app } = setup(async () => { calls++; started(); await hold; return ack(); });
  const first = app.synchronize(input); await ready;
  assert.equal((await app.synchronize(input)).status, "IN_PROGRESS");
  release(); assert.equal((await first).status, "SYNCHRONIZED");
  assert.equal((await app.synchronize(input)).status, "SYNCHRONIZED"); assert.equal(calls, 1);
});

for (const failure of ["timeout", "business-error", "bad-json", "wrong-member", "server-error", "duplicate"] as const) {
  test(`${failure} requires verification and does not blindly resend or claim synchronization`, async () => {
    let calls = 0;
    const { app } = setup(async () => {
      calls++;
      if (failure === "timeout") throw new TypeError("synthetic timeout with private details");
      if (failure === "bad-json") return new Response("malformed");
      if (failure === "wrong-member") return Response.json({ success: true, data: { member: { code: "987654321" } } });
      if (failure === "server-error") return new Response("synthetic", { status: 503 });
      if (failure === "duplicate") return Response.json({ success: false, error: { detail: { code: ["El elemento code ya esta en uso."] } } });
      return Response.json({ success: false, error: { detail: "private partner error" } });
    });
    assert.deepEqual(await app.synchronize(input), { status: "VERIFICATION_REQUIRED" });
    assert.deepEqual(await app.synchronize(input), { status: "VERIFICATION_REQUIRED" });
    assert.equal(calls, 1);
  });
}

test("rejected credentials stop retries; failed intent prevents dispatch; lost acknowledgement stays pending verification", async () => {
  const rejected = setup(async () => new Response(null, { status: 401 }));
  assert.equal((await rejected.app.synchronize(input)).status, "ACTION_REQUIRED");
  assert.equal((await rejected.app.synchronize(input)).status, "ACTION_REQUIRED");
  let calls = 0;
  const unavailable = setup(async () => { calls++; return ack(); });
  unavailable.store.failIntent = true;
  assert.equal((await unavailable.app.synchronize(input)).status, "UNAVAILABLE"); assert.equal(calls, 0);
  unavailable.store.failIntent = false; unavailable.store.failAcknowledgement = true;
  assert.equal((await unavailable.app.synchronize(input)).status, "VERIFICATION_REQUIRED");
  assert.equal((await unavailable.app.synchronize(input)).status, "VERIFICATION_REQUIRED"); assert.equal(calls, 1);
});

test("downgrade sends no update, deletion, segmentation or activation", async () => {
  let calls = 0;
  const { app } = setup(async () => { calls++; return ack(); });
  await app.synchronize(input);
  assert.equal((await app.synchronize({ ...input, journey: { state: "ACTIVE", currentLevel: "SILVER" } })).status, "NOT_ELIGIBLE");
  assert.equal(calls, 1);
});
