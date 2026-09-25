import assert from 'node:assert/strict';
import test from 'node:test';
import {courseVideoProgress} from '../src/database/migrations/026-course-video-progress.js';
import {PostgresProgressStore} from '../src/rewards/courses/progress.js';
import type {Database} from '../src/database/connection.js';
import {asCustomerId} from '../src/rewards/shared/identifiers.js';

test('additive migration and transactional store on isolated PostgreSQL engine', {skip:!process.env.PGLITE_MODULE_PATH},async()=>{
  const {PGlite}=await import(process.env.PGLITE_MODULE_PATH!);
  const pg=new PGlite();
  const customer=asCustomerId('00000000-0000-0000-0000-000000000301');
  const other=asCustomerId('00000000-0000-0000-0000-000000000302');
  try {
    await pg.exec('CREATE TABLE customers (id uuid PRIMARY KEY);');
    await pg.query('INSERT INTO customers VALUES ($1),($2)',[customer,other]);
    await pg.exec(courseVideoProgress.up);
    // PGlite has one connection: serialize clients, including their full transaction.
    let tail=Promise.resolve();
    const database={connect:async()=>{
      const previous=tail;let release!:()=>void;
      tail=new Promise<void>(resolve=>{release=resolve;});await previous;
      return {query:(sql:string,params?:unknown[])=>pg.query(sql,params),release};
    },end:async()=>{}} as unknown as Database;
    const store=new PostgresProgressStore(database);
    await Promise.all([store.save(customer,1256,{chapter_id:1256,ranges:[[0,60]],manual:false},100),store.save(customer,1256,{chapter_id:1256,ranges:[[30,90]],manual:true},100)]);
    const [row]=await new PostgresProgressStore(database).list(customer);
    assert.equal(row!.watched_seconds,90);assert.ok(row!.manual_completed_at);assert.ok(row!.playback_completed_at);
    assert.deepEqual(await store.list(other),[]);
    await assert.rejects(store.save(customer,1256,{chapter_id:1257,ranges:[[0,1000]],manual:false},100));
    assert.equal((await store.list(customer)).length,1,'failed update rolls back its initial insert');
    assert.equal((await pg.query('SELECT count(*)::int AS count FROM customers')).rows[0].count,2);
    await assert.rejects(pg.query('DELETE FROM customers WHERE id=$1',[customer]),'customer history is protected by FK');
  } finally {await pg.close();}
});
