import assert from 'node:assert/strict';
import test from 'node:test';
import {readHomeModule} from '../../src/lib/customer-home.ts';

test('failed navigation modules report unknown and preserve auth errors', async t => {
  const original = globalThis.fetch;
  t.after(()=>globalThis.fetch=original);
  globalThis.fetch = async () => {throw new Error('simulated network failure');};
  assert.deepEqual(await readHomeModule('http://fixture.invalid','/catalog','synthetic'),{status:503,data:null});
  globalThis.fetch = async()=>new Response('',{status:401});
  assert.deepEqual(await readHomeModule('http://fixture.invalid','/catalog','synthetic'),{status:401,data:null});
  globalThis.fetch = async()=>Response.json({items:[]});
  assert.deepEqual(await readHomeModule('http://fixture.invalid','/catalog','synthetic'),{status:200,data:{items:[]}});
});
