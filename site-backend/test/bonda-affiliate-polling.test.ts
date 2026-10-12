import assert from 'node:assert/strict';
import test from 'node:test';
import { startBondaAffiliatePolling } from '../src/rewards/bonda/affiliate-polling.js';

test('disabled polling does not call the database or create a timer', async () => {
  const runtime = startBondaAffiliatePolling({processDue:async()=>{throw Error('unexpected');}}, false,
    ()=>{throw Error('unexpected');}, ()=>{throw Error('unexpected');});
  await runtime.stop();
});

test('polling bounds batches, waits for completion and cancels cleanly', async () => {
  let finish!: () => void;
  const waiting = new Promise<void>(resolve=>{finish=resolve;});
  let calls=0,scheduled=0,cancelled=0;
  const results: unknown[]=[];
  const runtime=startBondaAffiliatePolling({processDue:async(_date,size)=>{
    calls++;assert.equal(size,25);await waiting;return {processedJobs:1,failedJobs:0};
  }},true,result=>results.push(result),(_next,delay)=>{
    assert.equal(delay,60000);scheduled++;return ()=>{cancelled++;};
  });
  assert.equal(calls,1);assert.equal(scheduled,0);
  finish();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(scheduled,1);assert.equal(results.length,1);
  await runtime.stop();assert.equal(cancelled,1);assert.equal(calls,1);
});

test('provider failure is sanitized and stop waits for in-flight batch without rescheduling', async () => {
  let finish!: () => void;
  const waiting=new Promise<void>(resolve=>{finish=resolve;});
  const results:unknown[]=[];
  const runtime=startBondaAffiliatePolling({processDue:async()=>{await waiting;throw Error('private upstream details');}},true,
    result=>results.push(result),()=>{throw Error('must not reschedule');});
  const stopped=runtime.stop();finish();await stopped;
  assert.deepEqual(results,[{error:'AFFILIATION_EVENT_BATCH_FAILED'}]);
});
