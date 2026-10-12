import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type {PoolClient} from 'pg';
import {prepareAffiliateEventSchema} from '../src/rewards/bonda/affiliate-schema.js';

test('selective preparation installs only 028, keeps capture off and does not backfill', async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE site_backend_migrations(id text PRIMARY KEY);
      INSERT INTO site_backend_migrations VALUES ('021_rewards_v2_canonical'),('022_bonda_coupons'),('026_course_video_progress');
      CREATE TABLE customers(id uuid PRIMARY KEY,rewards_id text,customer_status text);
      CREATE TABLE rewards_v2_journeys(customer_id uuid,state text,current_level text);`);
    const client={query:async(sql:string,values?:unknown[])=>{
      if(sql.includes('pg_advisory_'))return {rows:[]};
      // Multi-statement migration uses PostgreSQL simple query protocol.
      if(!values && sql.includes('CREATE TABLE bonda_affiliation')) {await db.exec(sql);return {rows:[]};}
      return db.query(sql,values);
    }} as unknown as PoolClient;
    assert.equal((await prepareAffiliateEventSchema(client,false)).state,'PLANNED');
    assert.equal((await prepareAffiliateEventSchema(client,true)).state,'APPLIED');
    assert.equal((await prepareAffiliateEventSchema(client,true)).state,'ALREADY_APPLIED');
    assert.deepEqual((await db.query('SELECT capture_enabled FROM bonda_affiliation_event_controls')).rows,[{capture_enabled:false}]);
    assert.equal((await db.query('SELECT * FROM bonda_affiliation_events')).rows.length,0);
    assert.deepEqual((await db.query<{id:string}>('SELECT id FROM site_backend_migrations ORDER BY id')).rows.map(x=>x.id),[
      '021_rewards_v2_canonical','022_bonda_coupons','026_course_video_progress','028_bonda_affiliation_events']);
  }finally{await db.close();}
});
