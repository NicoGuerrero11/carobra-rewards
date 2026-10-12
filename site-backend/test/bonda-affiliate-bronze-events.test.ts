import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { bondaCoupons } from "../src/database/migrations/022-bonda-coupons.js";
import { bondaAffiliateProfileSync } from "../src/database/migrations/027-bonda-affiliate-profile-sync.js";
import { bondaAffiliationEvents as migration } from "../src/database/migrations/028-bonda-affiliation-events.js";
import { BondaAffiliateProvisioningApplication } from "../src/rewards/bonda/affiliate-provisioning.js";
import { PostgresBondaAffiliateProvisioning } from "../src/rewards/bonda/persistence.js";
import { PostgresBondaAffiliateEligibility } from "../src/rewards/bonda/affiliate-eligibility.js";
import { PostgresBondaBackfillSource, BackfillBondaAffiliates } from "../src/rewards/bonda/affiliate-operations.js";
import { BondaAffiliateEventWorker } from "../src/rewards/bonda/affiliate-event-worker.js";
import { BondaAffiliateProfileSyncApplication } from "../src/rewards/bonda/affiliate-profile.js";
import { PostgresAffiliateProfileSyncStore } from "../src/rewards/bonda/affiliate-profile-persistence.js";
import { BondaAffiliateProfileWorker } from "../src/rewards/bonda/affiliate-profile-worker.js";
import { FakeBondaGateway } from "../src/rewards/bonda/fake-gateway.js";
import { BondaGatewayError } from "../src/rewards/bonda/gateway.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import { asCustomerId } from "../src/rewards/shared/identifiers.js";
import { evaluateRewardsLevel } from "../src/rewards/v2/level-engine.js";

const customerId = asCustomerId("00000000-0000-4000-8000-000000000801");
const identity = { customerId, rewardsId: "123456789" };
async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE customers (id uuid PRIMARY KEY, rewards_id text, curp text, email text,
    first_name text, last_name text, customer_status text, onboarding_status text);
    CREATE TABLE rewards_v2_journeys (customer_id uuid PRIMARY KEY REFERENCES customers(id), state text, current_level text);`);
  // Use the actual existing affiliate table definition and constraints, without unrelated coupon tables.
  await db.exec(bondaCoupons.up.slice(bondaCoupons.up.indexOf("CREATE TABLE bonda_affiliate_provisioning"), bondaCoupons.up.indexOf("CREATE TABLE bonda_coupon_requests")));
  await db.exec(bondaAffiliateProfileSync.up); await db.exec(migration.up);
  await db.query(`INSERT INTO customers VALUES ($1,'123456789','ABCD123456HMNLRS09','synthetic@example.test','Cliente','Prueba','ACTIVE','COMPLETED')`, [customerId]);
  await db.query(`INSERT INTO rewards_v2_journeys VALUES ($1,'INVITED',NULL)`, [customerId]);
  const query = async (sql: string, values?: unknown[]) => { const result = await db.query(sql, values); return { ...result, rowCount: result.affectedRows ?? result.rows.length }; };
  const database = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const gateway = new FakeBondaGateway();
  const clock = new FixedClock(new Date());
  const store = new PostgresBondaAffiliateProvisioning(database);
  const eligibility = new PostgresBondaAffiliateEligibility(database);
  const app = new BondaAffiliateProvisioningApplication(true, store, gateway, clock, eligibility);
  const worker = new BondaAffiliateEventWorker(database, app, true);
  return { db, database, gateway, clock, store, eligibility, app, worker };
}
async function capture(db: PGlite) { await db.exec(`UPDATE bonda_affiliation_event_controls SET capture_enabled = true; UPDATE bonda_profile_sync_controls SET capture_enabled = true;`); }
async function level(db: PGlite, level: string | null, state = "ACTIVE") {
  await db.query(`UPDATE rewards_v2_journeys SET current_level = $1, state = $2`, [level, state]);
}

test("affiliation event migration is inert by default, transactionally captures level changes and rolls back cleanly", async () => {
  const { db, database, app, worker } = await setup();
  try {
    await level(db, "BRONZE");
    assert.equal((await db.query(`SELECT * FROM bonda_affiliation_events`)).rows.length, 0);
    assert.deepEqual(await worker.processDue(new Date(), 25, "test"), { processedJobs: 0, failedJobs: 0 });
    const unavailable = { query: async () => { throw Error("disabled worker must not query"); } } as unknown as Pool;
    assert.equal((await new BondaAffiliateEventWorker(unavailable, app, false).processDue(new Date(), 25, "test")).processedJobs, 0);
    await capture(db); await level(db, "SILVER");
    await db.exec(`BEGIN; UPDATE rewards_v2_journeys SET current_level = 'GOLD'; ROLLBACK;`);
    await db.exec(`UPDATE customers SET email = 'changed@example.test'`);
    const events = (await database.query(`SELECT * FROM bonda_affiliation_events`)).rows;
    assert.equal(Number(events[0].generation), 1); assert.ok(!JSON.stringify(events).includes('changed@example.test'));
    await db.exec(migration.down);
    assert.equal((await db.query(`SELECT * FROM customers`)).rows.length, 1);
  } finally { await db.close(); }
});

test("canonical eligibility and backfill exclude invited/restricted/missing journeys and cover every level", async () => {
  const { db, database, app, gateway, eligibility } = await setup();
  try {
    const source = new PostgresBondaBackfillSource(database);
    for (const [current, state, expected] of [
      [null, 'INVITED', false], ['BRONZE','ACTIVE',true], ['SILVER','ACTIVE',true], ['GOLD','ACTIVE',true],
      ['PLATINUM','ACTIVE',true], ['TITANIUM','ACTIVE',true], ['GOLD','BLOCKED',false], ['GOLD','INACTIVE',false], ['UNKNOWN','ACTIVE',false],
    ] as const) {
      await level(db, current, state);
      assert.equal((await eligibility.read(customerId))?.eligible, expected);
      assert.equal((await source.listMissing(25)).length, expected ? 1 : 0);
    }
    await level(db, 'BRONZE'); await db.exec(`UPDATE customers SET customer_status = 'INACTIVE'`);
    assert.equal((await source.listMissing(25)).length, 0);
    await db.exec(`UPDATE customers SET customer_status = 'ACTIVE'; DELETE FROM rewards_v2_journeys;`);
    assert.equal((await eligibility.read(customerId))?.eligible, false);
    assert.equal((await app.afterRegistration(identity)).state, 'DISABLED');
    assert.equal((await app.ensureForBenefits(identity)).state, 'DISABLED');
    assert.equal(gateway.affiliateCodes.size, 0);
    await db.query(`INSERT INTO rewards_v2_journeys VALUES ($1,'ACTIVE','BRONZE')`, [customerId]);
    assert.equal((await new BackfillBondaAffiliates(source, app).run({ limit:25, apply:false })).attempted, 0);
    // Defense in depth: even a stale/malicious source cannot bypass the application guard.
    await level(db, null, 'INVITED');
    await new BackfillBondaAffiliates({ listMissing: async () => [identity] }, app).run({ limit:25, apply:true });
    assert.equal(gateway.affiliateCodes.size, 0);
    await level(db, 'BRONZE'); await new BackfillBondaAffiliates(source, app).run({ limit:25, apply:true });
    assert.equal(gateway.affiliateCodes.size, 1);
  } finally { await db.close(); }
});

for (const productType of ['AFORE','PPR']) test(`first active ${productType} reaches Bronze, affiliates once and enriches only at Gold`, async () => {
  const { db, database, app, gateway, worker } = await setup();
  try {
    await capture(db);
    let creates = 0; const create = gateway.createAffiliate.bind(gateway);
    gateway.createAffiliate = async code => { creates++; return create(code); };
    const patches: unknown[] = [];
    const profileApp = new BondaAffiliateProfileSyncApplication(true,
      { curpTextAccepted:true, patchFields:['email','nombre','apellido','curp'] },
      { createAffiliateProfile:async () => { throw Error('base creation only'); }, updateAffiliateProfile: async (_code, fields) => { patches.push(fields); } },
      new PostgresAffiliateProfileSyncStore(database), 'synthetic-revision-key-used-only-in-tests');
    const profiles = new BondaAffiliateProfileWorker(database, profileApp, { enabled:true, contractReady:true, keyReady:true });
    assert.equal((await app.afterRegistration(identity)).state, 'DISABLED');
    assert.equal((await app.ensureForBenefits(identity)).state, 'DISABLED');
    const facts = [{ productType, status:'ACTIVE' }];
    const evaluate = (currentLevel: 'BRONZE' | null) => evaluateRewardsLevel({ currentLevel,
      activeProductCount:facts.filter(fact => fact.status === 'ACTIVE').length, registrationMonths:0, qualifyingActivityCount:0,
      matrix:{ productThresholds:[{level:'BRONZE',minimumActiveProducts:1},{level:'GOLD',minimumActiveProducts:2}], silver:null } });
    assert.equal(evaluate(null).resultingLevel, 'BRONZE');
    await level(db, evaluate(null).resultingLevel);
    await worker.processDue(new Date(),25,'test'); await profiles.processDue(new Date(),25,'test');
    await worker.processDue(new Date(),25,'test'); await app.ensureForBenefits(identity);
    assert.equal(creates,1); assert.equal(patches.length,0);
    facts.push({ productType:'ADDITIONAL_PRODUCT', status:'ACTIVE' });
    await level(db, evaluate('BRONZE').resultingLevel);
    await worker.processDue(new Date(),25,'test'); await profiles.processDue(new Date(),25,'test');
    assert.equal(creates,1); assert.equal(patches.length,1);
    await profiles.processDue(new Date(),25,'test'); assert.equal(patches.length,1);
    await level(db, null, 'INVITED'); await worker.processDue(new Date(),25,'test'); await profiles.processDue(new Date(),25,'test');
    assert.equal((await app.ensureForBenefits(identity)).state,'ACTIVE');
    await level(db,'GOLD'); await worker.processDue(new Date(),25,'test'); await profiles.processDue(new Date(),25,'test');
    assert.equal(creates,1); assert.equal(patches.length,1);
  } finally { await db.close(); }
});

test("pending retries stop below Bronze and reconcile a lost acknowledgement without a second POST", async () => {
  const { db, store, app, gateway } = await setup();
  try {
    await level(db,'BRONZE'); let creates = 0;
    const create = gateway.createAffiliate.bind(gateway);
    gateway.createAffiliate = async code => { creates++; await create(code); throw new BondaGatewayError('PARTNER_UNAVAILABLE','synthetic lost acknowledgement',true); };
    assert.equal((await app.ensureForBenefits(identity)).state,'ACTIVE'); assert.equal(creates,1);
    await level(db,null,'INVITED'); await db.exec(`UPDATE bonda_affiliate_provisioning SET next_attempt_at = NULL`);
    let reads = 0; const exists = gateway.affiliateExists.bind(gateway);
    gateway.affiliateExists = async code => { reads++; return exists(code); };
    await app.retryDue(); assert.equal(reads,0); assert.equal(creates,1);
    await level(db,'BRONZE'); await db.exec(`UPDATE bonda_affiliate_provisioning SET next_attempt_at = NULL`);
    await app.retryDue(); assert.equal(reads,0); assert.equal(creates,1); assert.equal((await store.find(customerId))?.state,'ACTIVE');
  } finally { await db.close(); }
});

test("level event arriving during dispatch remains queued and repeat events do not create twice", async () => {
  const { db, gateway, worker } = await setup();
  try {
    await capture(db); await level(db,'BRONZE');
    const create = gateway.createAffiliate.bind(gateway); let creates = 0;
    gateway.createAffiliate = async code => { creates++; await level(db,'GOLD'); return create(code); };
    await worker.processDue(new Date(),25,'test');
    const row = (await db.query<{generation:string;processed_generation:string}>(`SELECT generation, processed_generation FROM bonda_affiliation_events`)).rows[0]!;
    assert.ok(Number(row.generation) > Number(row.processed_generation));
    await worker.processDue(new Date(),25,'test'); assert.equal(creates,1);
  } finally { await db.close(); }
});
