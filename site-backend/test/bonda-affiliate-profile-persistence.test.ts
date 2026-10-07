import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { PoolClient, QueryResultRow } from "pg";
import { bondaAffiliateProfileSync as migration } from "../src/database/migrations/027-bonda-affiliate-profile-sync.js";
import { PostgresAffiliateProfileSyncStore, type ProfileDatabase } from "../src/rewards/bonda/affiliate-profile-persistence.js";
import { BondaAffiliateProfileSyncApplication, pendingAffiliateProfileContract, type AffiliateProfileCheckpoint } from "../src/rewards/bonda/affiliate-profile.js";
import { BondaAffiliateProfileWorker } from "../src/rewards/bonda/affiliate-profile-worker.js";
import { loadConfig } from "../src/config.js";

const customerId = "00000000-0000-4000-8000-000000000901";
const reviewerId = "00000000-0000-4000-8000-000000000902";
const confirmed = { curpTextAccepted: true, patchFields: ["email", "nombre", "apellido", "curp"] as const };
const revisionKey = "synthetic-revision-key-used-only-in-tests";
const checkpoint: AffiliateProfileCheckpoint = {
  rewardsId: "123456789", status: "VERIFICATION_REQUIRED",
  fieldDigests: { email: "a".repeat(64), nombre: "b".repeat(64), apellido: "c".repeat(64), curp: "d".repeat(64) },
};
function adapter(db: PGlite): ProfileDatabase {
  const query = async <R extends QueryResultRow>(sql: string, values?: unknown[]) => {
    const result = await db.query<R>(sql, values);
    return { rows: result.rows, rowCount: result.affectedRows ?? null };
  };
  return { query, connect: async () => ({ query, release() {} }) as unknown as PoolClient };
}
async function setup(path?: string) {
  const db = new PGlite(path);
  await db.exec(`
    CREATE TABLE customers (id uuid PRIMARY KEY, rewards_id text, curp text, email text, first_name text,
      last_name text, customer_status text, onboarding_status text, updated_at timestamptz, phone text);
    CREATE TABLE rewards_v2_journeys (customer_id uuid PRIMARY KEY REFERENCES customers(id), state text, current_level text);
    CREATE TABLE bonda_affiliate_provisioning (customer_id uuid PRIMARY KEY REFERENCES customers(id), rewards_id text, state text);
  `);
  await db.exec(migration.up);
  await db.query(`INSERT INTO customers VALUES ($1,'123456789','ABCD123456HMNLRS09','synthetic@example.test',
    'Cliente','Sintético','ACTIVE','COMPLETED',now(),'')`, [customerId]);
  await db.query(`INSERT INTO rewards_v2_journeys VALUES ($1,'ACTIVE','GOLD')`, [customerId]);
  await db.query(`INSERT INTO bonda_affiliate_provisioning VALUES ($1,'123456789','ACTIVE')`, [customerId]);
  return db;
}
async function enableCapture(db: PGlite) { await db.exec(`UPDATE bonda_profile_sync_controls SET capture_enabled = true`); }

test("migration disables capture by default, queues real profile/level/affiliate changes atomically and rolls back", async () => {
  const db = await setup();
  try {
    assert.equal((await db.query(`SELECT * FROM bonda_profile_sync_queue`)).rows.length, 0);
    await enableCapture(db);
    await db.exec(`UPDATE customers SET phone = 'synthetic-other', updated_at = now()`);
    assert.equal((await db.query(`SELECT * FROM bonda_profile_sync_queue`)).rows.length, 0);
    await db.exec(`UPDATE customers SET email = 'new@example.test'`);
    await db.exec(`UPDATE rewards_v2_journeys SET current_level = 'PLATINUM'`);
    await db.exec(`UPDATE bonda_affiliate_provisioning SET state = 'PENDING'; UPDATE bonda_affiliate_provisioning SET state = 'ACTIVE'`);
    assert.equal((await db.query<{ generation: number }>(`SELECT generation::int FROM bonda_profile_sync_queue`)).rows[0]?.generation, 3);
    await db.exec(`BEGIN; UPDATE customers SET first_name = 'No persistir'; ROLLBACK;`);
    assert.equal((await db.query<{ generation: number }>(`SELECT generation::int FROM bonda_profile_sync_queue`)).rows[0]?.generation, 3);
    const queue = JSON.stringify((await db.query(`SELECT * FROM bonda_profile_sync_queue`)).rows);
    assert.ok(!queue.includes('new@example.test')); assert.ok(!queue.includes('ABCD123456HMNLRS09'));
    await db.exec(migration.down);
    assert.equal((await db.query(`SELECT * FROM customers`)).rows.length, 1);
    assert.equal((await db.query<{ value: string | null }>(`SELECT to_regclass('bonda_profile_sync_queue')::text AS value`)).rows[0]?.value, null);
  } finally { await db.close(); }
});

test("durable checkpoint survives reopening PostgreSQL files without retaining raw profile data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "carobra-profile-postgres-"));
  let db = await setup(directory);
  try {
    let store = new PostgresAffiliateProfileSyncStore(adapter(db));
    assert.equal(await store.claim(customerId), true); await store.write(customerId, checkpoint); await store.release(customerId);
    const before = await store.read(customerId);
    await db.close(); db = new PGlite(directory); store = new PostgresAffiliateProfileSyncStore(adapter(db));
    assert.deepEqual(await store.read(customerId), before);
    assert.equal((await store.read(customerId))?.status, "VERIFICATION_REQUIRED");
    await assert.rejects(db.query(`UPDATE bonda_profile_sync_checkpoints SET field_digests = '{"curp":null}'`));
    await assert.rejects(db.query(`UPDATE bonda_profile_sync_checkpoints SET field_digests = '{"curp":"ABCD123456HMNLRS09"}'`));
  } finally { await db.close(); await rm(directory, { recursive: true, force: true }); }
});

test("independent workers claim once; expired writers cannot overwrite or release the successor lease", async () => {
  const db = await setup();
  try {
    const first = new PostgresAffiliateProfileSyncStore(adapter(db));
    const second = new PostgresAffiliateProfileSyncStore(adapter(db));
    assert.deepEqual(await Promise.all([first.claim(customerId), second.claim(customerId)]), [true, false]);
    await first.write(customerId, checkpoint);
    await db.exec(`UPDATE bonda_profile_sync_checkpoints SET lease_until = now() - interval '1 second'`);
    assert.equal(await second.claim(customerId), true);
    await assert.rejects(first.write(customerId, { ...checkpoint, status: "SYNCHRONIZED" }), /claim_lost/);
    await first.release(customerId);
    assert.equal(await new PostgresAffiliateProfileSyncStore(adapter(db)).claim(customerId), false);
    assert.equal((await second.read(customerId))?.status, "VERIFICATION_REQUIRED");
    await second.release(customerId);
  } finally { await db.close(); }
});

test("manual reconciliation is dry-run first, checks operation identity, audits and retries only with evidence", async () => {
  const db = await setup();
  try {
    const store = new PostgresAffiliateProfileSyncStore(adapter(db));
    await store.claim(customerId); await store.write(customerId, checkpoint); await store.release(customerId);
    const operationId = (await store.read(customerId))!.operationId!;
    const review = { customerId, operationId, outcome: "NOT_APPLIED" as const, evidenceReference: "BONDA-TICKET-TEST-01", reviewerId, apply: false };
    assert.equal(await store.reconcile(review), "DRY_RUN");
    assert.equal((await store.read(customerId))?.status, "VERIFICATION_REQUIRED");
    await assert.rejects(store.reconcile({ ...review, apply: true, operationId: reviewerId }), /stale_profile_review/);
    await assert.rejects(store.reconcile({ ...review, apply: true, evidenceReference: 'synthetic@example.test' }), /sensitive/);
    assert.equal(await store.reconcile({ ...review, apply: true }), "RECONCILED");
    assert.deepEqual((await store.read(customerId))?.fieldDigests, {});
    assert.equal((await store.read(customerId))?.status, "RETRY_APPROVED");
    assert.equal(await store.reconcile({ ...review, apply: true }), "ALREADY_RECONCILED");
    await assert.rejects(store.reconcile({ ...review, apply: true, outcome: 'APPLIED' }), /conflicting_profile_review/);
    assert.equal((await db.query(`SELECT * FROM bonda_profile_sync_reviews`)).rows.length, 1);
    assert.equal((await db.query(`SELECT * FROM bonda_profile_sync_queue`)).rows.length, 1);
  } finally { await db.close(); }
});

test("worker reads current canonical identity and level, coalesces repeated events and retains changes during dispatch", async () => {
  const db = await setup();
  try {
    await enableCapture(db); await db.exec(`UPDATE customers SET email = 'first@example.test'`);
    const store = new PostgresAffiliateProfileSyncStore(adapter(db));
    const patches: unknown[] = [];
    const app = new BondaAffiliateProfileSyncApplication(true, confirmed, {
      createAffiliateProfile: async () => { throw Error('worker must not create from absence'); },
      updateAffiliateProfile: async (_id, fields) => {
        patches.push(fields);
        if (patches.length === 1) await db.exec(`UPDATE customers SET email = 'second@example.test'`);
      },
    }, store, revisionKey);
    const worker = new BondaAffiliateProfileWorker(adapter(db), app, { enabled: true, contractReady: true, keyReady: true });
    assert.deepEqual(await worker.processDue(new Date(), 25, 'synthetic'), { processedJobs: 1, failedJobs: 0 });
    await worker.processDue(new Date(), 25, 'synthetic');
    assert.deepEqual(patches[1], { email: 'second@example.test' });
    assert.equal((await worker.processDue(new Date(), 25, 'synthetic')).processedJobs, 0);
    await db.exec(`UPDATE rewards_v2_journeys SET current_level = 'SILVER'; UPDATE customers SET email = 'below@example.test'`);
    await worker.processDue(new Date(), 25, 'synthetic'); assert.equal(patches.length, 2);
    assert.equal((await db.query<{ last_status: string }>(`SELECT last_status FROM bonda_profile_sync_queue`)).rows[0]?.last_status, 'NOT_ELIGIBLE');
    await db.exec(`UPDATE rewards_v2_journeys SET current_level = 'GOLD'`);
    await worker.processDue(new Date(), 25, 'synthetic'); assert.deepEqual(patches[2], { email: 'below@example.test' });
  } finally { await db.close(); }
});

test("APPLIED reconciliation unblocks newer local changes without resending acknowledged values", async () => {
  const db = await setup();
  try {
    await enableCapture(db); await db.exec(`UPDATE customers SET email = 'initial@example.test'`);
    const store = new PostgresAffiliateProfileSyncStore(adapter(db));
    let fail = true; const patches: unknown[] = [];
    const app = new BondaAffiliateProfileSyncApplication(true, confirmed, {
      createAffiliateProfile: async () => 'CREATED',
      updateAffiliateProfile: async (_id, fields) => { patches.push(fields); if (fail) throw Error('lost response'); },
    }, store, revisionKey);
    const worker = new BondaAffiliateProfileWorker(adapter(db), app, { enabled: true, contractReady: true, keyReady: true });
    await worker.processDue(new Date(), 25, 'synthetic');
    await db.exec(`UPDATE customers SET email = 'latest@example.test'`);
    await worker.processDue(new Date(), 25, 'synthetic'); assert.equal(patches.length, 1);
    fail = false;
    await store.reconcile({ customerId, operationId: (await store.read(customerId))!.operationId!, outcome: 'APPLIED',
      evidenceReference: 'BONDA-TICKET-TEST-02', reviewerId, apply: true });
    await worker.processDue(new Date(), 25, 'synthetic');
    assert.deepEqual(patches[1], { email: 'latest@example.test' });
  } finally { await db.close(); }
});

test("default config and contract gates perform no database access and cannot be enabled by an environment flag", async () => {
  assert.equal(loadConfig({}).bonda?.profileSync?.enabled, false);
  assert.throws(() => loadConfig({ BONDA_PROFILE_SYNC_ENABLED: 'true' }), /contract is pending/);
  const unavailable = { query: async () => { throw Error('database must not be read'); }, connect: async () => { throw Error('database must not be read'); } };
  const store = new PostgresAffiliateProfileSyncStore(unavailable);
  const app = new BondaAffiliateProfileSyncApplication(false, pendingAffiliateProfileContract, {
    createAffiliateProfile: async () => { throw Error('no calls'); }, updateAffiliateProfile: async () => { throw Error('no calls'); },
  }, store, '');
  for (const readiness of [
    { enabled: false, contractReady: true, keyReady: true },
    { enabled: true, contractReady: false, keyReady: true },
    { enabled: true, contractReady: true, keyReady: false },
  ]) assert.deepEqual(await new BondaAffiliateProfileWorker(unavailable, app, readiness).processDue(new Date(), 25, 'synthetic'), { processedJobs: 0, failedJobs: 0 });
});

test("catch-up is bounded and existing base affiliation triggers previously blocked work", async () => {
  const db = await setup();
  try {
    const store = new PostgresAffiliateProfileSyncStore(adapter(db));
    let patches = 0;
    const app = new BondaAffiliateProfileSyncApplication(true, confirmed, {
      createAffiliateProfile: async () => { throw Error('never infer creation'); },
      updateAffiliateProfile: async () => { patches++; },
    }, store, revisionKey);
    const worker = new BondaAffiliateProfileWorker(adapter(db), app, { enabled: true, contractReady: true, keyReady: true });
    assert.equal((await worker.enqueueExisting(1)).enqueued, 0);
    await enableCapture(db);
    assert.deepEqual(await worker.enqueueExisting(1), { enqueued: 1, nextCursor: customerId });
    assert.deepEqual(await worker.enqueueExisting(1, customerId), { enqueued: 0, nextCursor: null });
    await db.exec(`UPDATE bonda_affiliate_provisioning SET state = 'PENDING'`);
    await worker.processDue(new Date(), 1, 'synthetic'); assert.equal(patches, 0);
    await db.exec(`UPDATE bonda_affiliate_provisioning SET state = 'ACTIVE'`);
    await worker.processDue(new Date(), 1, 'synthetic'); assert.equal(patches, 1);
  } finally { await db.close(); }
});
