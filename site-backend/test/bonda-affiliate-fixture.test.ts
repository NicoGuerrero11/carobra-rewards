import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {rewardsLedgerFoundation} from '../src/database/migrations/001-rewards-ledger-foundation.js';
import {rewardsV2Foundation} from '../src/database/migrations/018-rewards-v2-foundation.js';
import {rewardsV2LiveJourney} from '../src/database/migrations/019-rewards-v2-live-journey.js';
import {bondaCoupons} from '../src/database/migrations/022-bonda-coupons.js';
import {bondaAffiliationEvents} from '../src/database/migrations/028-bonda-affiliation-events.js';
import {prepareAffiliationFixture,activateAffiliationFixture,inspectAffiliationFixture} from '../src/rewards/bonda/affiliate-fixture.js';
import {BondaAffiliateEventWorker} from '../src/rewards/bonda/affiliate-event-worker.js';
import {BondaAffiliateProvisioningApplication} from '../src/rewards/bonda/affiliate-provisioning.js';
import {PostgresBondaAffiliateProvisioning} from '../src/rewards/bonda/persistence.js';
import {PostgresBondaAffiliateEligibility} from '../src/rewards/bonda/affiliate-eligibility.js';
import {FakeBondaGateway} from '../src/rewards/bonda/fake-gateway.js';
import {SystemClock} from '../src/rewards/shared/clock.js';

test('fixture reaches Bronze through canonical rule and decision, worker affiliates once without points or a manual POST',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE customers(id uuid PRIMARY KEY,rewards_id text UNIQUE,curp text UNIQUE,
      first_name text,last_name text,email text,phone text,postal_code text,state text,city text,
      customer_status text,onboarding_status text,created_at timestamptz,updated_at timestamptz);`);
    for(const migration of [rewardsLedgerFoundation,rewardsV2Foundation,rewardsV2LiveJourney])await db.exec(migration.up);
    await db.exec(bondaCoupons.up.slice(bondaCoupons.up.indexOf('CREATE TABLE bonda_affiliate_provisioning'),bondaCoupons.up.indexOf('CREATE TABLE bonda_coupon_requests')));
    await db.exec(bondaAffiliationEvents.up);
    await db.exec(`UPDATE rewards_v2_rule_versions SET approved_for_production=true,approved_at=now(),approved_by='synthetic-test' WHERE code='V2_FIRST_ACTIVE_PRODUCT_LEVEL';`);
    const query=async(sql:string,values?:unknown[])=>{
      if(sql.includes('pg_advisory_'))return {rows:[],rowCount:0};
      const result=await db.query(sql,values);return {...result,rowCount:result.affectedRows??result.rows.length};
    };
    const pool={query,connect:async()=>({query,release(){}})} as unknown as Pool;
    await assert.rejects(prepareAffiliationFixture(pool),/REQUIRES_EVENT_CAPTURE/);
    await db.exec('UPDATE bonda_affiliation_event_controls SET capture_enabled=true');
    const prepared=await prepareAffiliationFixture(pool);
    assert.equal(prepared.journeyState,'INVITED');assert.match(prepared.rewardsId,/^[1-9][0-9]{8}$/);
    assert.equal((await prepareAffiliationFixture(pool)).customerId,prepared.customerId);
    const gateway=new FakeBondaGateway(); let creates=0;
    const create=gateway.createAffiliate.bind(gateway);
    gateway.createAffiliate=async(code)=>{creates++;return create(code);};
    const application=new BondaAffiliateProvisioningApplication(true,new PostgresBondaAffiliateProvisioning(pool),gateway,
      new SystemClock(),new PostgresBondaAffiliateEligibility(pool));
    const worker=new BondaAffiliateEventWorker(pool,application,true);
    await worker.processDue(new Date(),25,'fixture-test');assert.equal(creates,0);
    const activated=await activateAffiliationFixture(pool);
    assert.equal(activated.level,'BRONZE');assert.equal(creates,0);
    await worker.processDue(new Date(),25,'fixture-test');
    const verified=await inspectAffiliationFixture(pool);
    assert.equal(verified.affiliationState,'ACTIVE');assert.equal(creates,1);
    assert.equal(verified.eventGeneration,verified.processedGeneration);
    assert.equal(verified.ledgerEntries,0);assert.equal(verified.rewardEvents,0);
    assert.equal((await activateAffiliationFixture(pool)).replayed,true);
    await worker.processDue(new Date(),25,'fixture-test');assert.equal(creates,1);
    assert.equal((await db.query('SELECT * FROM rewards_product_facts')).rows.length,1);
    assert.equal((await db.query('SELECT * FROM rewards_level_decisions')).rows.length,1);
    await db.exec('UPDATE rewards_accounts SET available_points=1');
    await assert.rejects(activateAffiliationFixture(pool),/HAS_POINTS/);
  }finally{await db.close();}
});
