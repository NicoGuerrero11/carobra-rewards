import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { bondaPoints } from '../src/database/migrations/029-bonda-points.js';
import { BondaPointsApplication } from '../src/rewards/bonda/points-application.js';
import { PostgresBondaPointsStore } from '../src/rewards/bonda/points-store.js';
import { BondaPointsError, BondaPointsHttpGateway, type BondaPointsGateway, type BondaCredit } from '../src/rewards/bonda/points-gateway.js';
const customer = '00000000-0000-4000-8000-000000000901', account = '00000000-0000-4000-8000-000000000902';
const credit: BondaCredit = {micrositeId:'synthetic',sourceWalletId:'10',walletId:'20',rewardsId:'123456789',points:'300'};
const config = () => loadConfig({BONDA_BASE_URL:'https://bonda.example.test',BONDA_ALLOWED_HOSTS:'bonda.example.test',BONDA_MICROSITE_ID:'synthetic',BONDA_POINTS_TOKEN:'synthetic-token',BONDA_POINTS_SOURCE_WALLET_ID:'10',BONDA_POINTS_SEND_ENABLED:'true',BONDA_POINTS_BALANCE_ENABLED:'true'}).bonda!;
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data),{status});
const ack = (data = {}) => ({success:true,data:{id:30,status:'COMPLETED',type:'ASSIGNATION',amount:300,affiliate_wallet:{wallet_id:20,affiliate_code:'123456789'},is_group:false,group:null,...data}});
async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE customers(id uuid PRIMARY KEY,rewards_id text,email text,customer_status text);
    CREATE TABLE rewards_accounts(id uuid PRIMARY KEY,customer_id uuid REFERENCES customers(id));
    CREATE TABLE rewards_v2_journeys(customer_id uuid PRIMARY KEY,state text,current_level text);
    CREATE TABLE bonda_affiliate_provisioning(customer_id uuid PRIMARY KEY,rewards_id text,state text);
    CREATE TABLE ledger_entries(id uuid PRIMARY KEY,account_id uuid REFERENCES rewards_accounts(id),entry_type text,points_delta bigint);
    CREATE TABLE point_lots(source_ledger_entry_id uuid PRIMARY KEY REFERENCES ledger_entries(id),remaining_points bigint,expired_at timestamptz,expires_at timestamptz);
    INSERT INTO customers VALUES ('${customer}','123456789','synthetic@example.test','ACTIVE');
    INSERT INTO rewards_accounts VALUES ('${account}','${customer}');
    INSERT INTO rewards_v2_journeys VALUES ('${customer}','ACTIVE','GOLD');
    INSERT INTO bonda_affiliate_provisioning VALUES ('${customer}','123456789','ACTIVE');`);
  await db.exec(bondaPoints.up);
  const query = async (sql: string, values?: unknown[]) => { const r = await db.query(sql, values); return {...r,rowCount:r.affectedRows ?? r.rows.length}; };
  const pool = {query,connect:async () => ({query,release(){}})} as unknown as Pool;
  const store = new PostgresBondaPointsStore(pool);
  const calls: BondaCredit[] = []; let movement = 30;
  const gateway: BondaPointsGateway = {wallet:async () => ({id:'20',balance:'900',email:'synthetic@example.test'}),assign:async input => {calls.push(input);return String(movement++);},verify:async (_input,id) => id};
  const app = new BondaPointsApplication(config(),store,gateway);
  const award = async (points=300) => {const id=randomUUID();await db.query(`INSERT INTO ledger_entries VALUES ($1,$2,'ISSUANCE',$3)`,[id,account,points]);await db.query(`INSERT INTO point_lots VALUES ($1,$2,NULL,now()+interval '18 months')`,[id,points]);return id;};
  const ready = () => db.exec(`UPDATE bonda_point_credits SET next_attempt_at=now(),lease_until=NULL,lease_token=NULL`);
  return {db,pool,store,gateway,app,calls,award,ready};
}
test('points flags default off and fail closed with incomplete or preview config', () => {
  assert.deepEqual(loadConfig({}).bonda?.points,{sendEnabled:false,balanceEnabled:false});
  for(const env of [{BONDA_POINTS_SEND_ENABLED:'true'}, {BONDA_POINTS_BALANCE_ENABLED:'true',BONDA_POINTS_TOKEN:'test'}, {BONDA_POINTS_SEND_ENABLED:'true',BONDA_MICROSITE_ID:'synthetic',BONDA_POINTS_TOKEN:'test'}, {BONDA_LOCAL_PREVIEW_ENABLED:'true',BONDA_POINTS_BALANCE_ENABLED:'true',BONDA_POINTS_TOKEN:'test',BONDA_MICROSITE_ID:'synthetic'}]) assert.throws(()=>loadConfig(env));
});
test('wallet and movement contract use exact identity, wallet.id and 1:1 points', async () => {
  const requests: Array<{url:string;init?:RequestInit}> = [];
  const gateway = new BondaPointsHttpGateway(config(),async (url,init) => {requests.push({url:String(url),...(init ? {init} : {})});return String(url).includes('/search?') ? reply({success:true,data:{code:'123456789',id:999,email:'synthetic@example.test',wallet:{id:20,balance:0}}}) : reply(ack());});
  assert.deepEqual(await gateway.wallet('123456789'),{id:'20',balance:'0',email:'synthetic@example.test'});
  assert.equal(await gateway.assign(credit),'30');assert.equal(await gateway.verify(credit,'30'),'30');
  assert.equal(requests[1]!.url,'https://bonda.example.test/api/v2/microsite/synthetic/wallets/10/movements');
  assert.deepEqual(JSON.parse(String(requests[1]!.init!.body)),{affiliate_wallet_ids:[20],each_amount:300,type:'ASSIGNATION',description:'Puntos ganados en Carobra Rewards'});
  assert.equal((requests[1]!.init!.headers as Record<string,string>).token,'synthetic-token');assert.equal(requests[1]!.init!.redirect,'error');
  await assert.rejects(new BondaPointsHttpGateway(config(),async()=>reply({success:true,data:{code:'987654321',wallet:{id:20,balance:300}}})).wallet('123456789'),{code:'UNAVAILABLE'});
});
test('only exact COMPLETED individual credits confirm; timeouts stay uncertain', async () => {
  for(const data of [{status:'PENDING'},{amount:100},{affiliate_wallet:{wallet_id:21}},{is_group:true},{group:123},{id:0},{amount:9007199254740992}]) await assert.rejects(new BondaPointsHttpGateway(config(),async()=>reply(ack(data))).assign(credit),{code:'UNCERTAIN'});
  for(const response of [reply({success:false}),reply({success:false},500),new Response('not json'),reply(ack(),302)]) await assert.rejects(new BondaPointsHttpGateway(config(),async()=>response).assign(credit),{code:'UNCERTAIN'});
  for(const [remote,local] of [['NOT_ENOUGH_POINTS','INSUFFICIENT_FUNDS'],['AFFILIATE_CANNOT_CREATE_MOVEMENT','PROFILE_PENDING']]) await assert.rejects(new BondaPointsHttpGateway(config(),async()=>reply({success:false,error:{code:remote}},400)).assign(credit),{code:local});
  const short={...config(),requestTimeoutMs:5};
  await assert.rejects(new BondaPointsHttpGateway(short,()=>new Promise(()=>{})).assign(credit),{code:'UNCERTAIN'});
  await assert.rejects(new BondaPointsHttpGateway(short,()=>new Promise(()=>{})).wallet('123456789'),{code:'UNAVAILABLE'});
});
test('award transaction captures once; rollback/non-earnings do not queue', async () => {
  const {db,award,store}=await setup();try {
    const id=await award();assert.equal((await store.read(id))?.points,'300');
    await db.exec(`BEGIN; INSERT INTO ledger_entries VALUES ('${randomUUID()}','${account}','ISSUANCE',500); ROLLBACK;`);
    await db.query(`INSERT INTO ledger_entries VALUES ($1,$2,'CONSUMPTION',-100)`,[randomUUID(),account]);assert.equal((await store.due(25)).length,1);
    await assert.rejects(db.query(`INSERT INTO ledger_entries VALUES ($1,$2,'ISSUANCE',300)`,[id,account]));
    await db.exec(bondaPoints.down);assert.equal((await db.query('SELECT * FROM ledger_entries')).rows.length,2);
  }finally{await db.close();}
});
test('all pre-Gold awards wait, then credit once without local debit or level change', async () => {
  const {db,award,store,app,calls,ready}=await setup();try {
    const a=await award(300),b=await award(600);
    for(const level of ['BRONZE','SILVER']){await db.query('UPDATE rewards_v2_journeys SET current_level=$1',[level]);await ready();await app.processDue(new Date(),25,'test');assert.equal(calls.length,0);}
    await db.exec("UPDATE rewards_v2_journeys SET current_level='GOLD'");await ready();assert.deepEqual(await app.processDue(new Date(),25,'test'),{processedJobs:2,failedJobs:0});
    assert.equal(calls.reduce((sum,c)=>sum+Number(c.points),0),900);assert.equal((await store.read(a))?.state,'CONFIRMED');assert.equal((await store.read(b))?.state,'CONFIRMED');
    await ready();await app.processDue(new Date(),25,'test');assert.equal(calls.length,2);
    assert.equal((await db.query<{sum:string}>('SELECT sum(remaining_points)::text FROM point_lots')).rows[0]!.sum,'900');assert.deepEqual(await store.pending(customer),{pending:'0',uncertain:'0'});
  }finally{await db.close();}
});
test('missing affiliate/email, restrictions, downgrade during read and expired lot prevent credit', async () => {
  const {db,award,app,calls,ready,gateway,store}=await setup();try {
    const id=await award();
    for(const sql of ["UPDATE bonda_affiliate_provisioning SET state='PENDING'","UPDATE bonda_affiliate_provisioning SET state='ACTIVE'; UPDATE customers SET email=NULL","UPDATE customers SET email='synthetic@example.test',customer_status='BLOCKED'","UPDATE customers SET customer_status='ACTIVE'; UPDATE rewards_v2_journeys SET state='INACTIVE'"]){await db.exec(sql);await ready();await app.processOne(id);assert.equal(calls.length,0);}
    await db.exec("UPDATE rewards_v2_journeys SET state='ACTIVE'");await ready();gateway.wallet=async()=>{await db.exec("UPDATE rewards_v2_journeys SET current_level='SILVER'");return{id:'20',balance:'0',email:'synthetic@example.test'};};await app.processOne(id);assert.equal(calls.length,0);
    await db.exec("UPDATE rewards_v2_journeys SET current_level='GOLD'; UPDATE point_lots SET expires_at=now()-interval '1 day'");await ready();await app.processOne(id);assert.equal((await store.read(id))?.state,'ACTION_REQUIRED');assert.equal(calls.length,0);
  }finally{await db.close();}
});
test('uncertain credit survives worker restart and requires verified operator reconciliation', async () => {
  const {db,award,app,calls,store,pool,gateway,ready}=await setup();try {
    const id=await award();gateway.assign=async c=>{calls.push(c);throw new BondaPointsError('UNCERTAIN');};await app.processOne(id);const row=(await store.read(id))!;assert.equal(row.state,'VERIFICATION_REQUIRED');
    await ready();const restarted=new BondaPointsApplication(config(),new PostgresBondaPointsStore(pool),gateway);await restarted.processDue(new Date(),25,'restart');await restarted.processOne(id);assert.equal(calls.length,1);assert.deepEqual(await store.pending(customer),{pending:'0',uncertain:'300'});
    const review={entryId:id,operationId:row.operation_id!,outcome:'APPLIED' as const,movementId:'30',reviewerId:customer,evidenceReference:'ticket/SYNTHETIC-1'};
    assert.equal(await app.reconcile(review),'DRY_RUN');gateway.verify=async()=>{throw new BondaPointsError('UNCERTAIN');};await assert.rejects(app.reconcile(review,true));
    gateway.verify=async()=> '30';assert.equal(await app.reconcile(review,true),'RECONCILED');assert.equal(await app.reconcile(review,true),'ALREADY_RECONCILED');await assert.rejects(app.reconcile({...review,movementId:'31'},true));assert.equal(calls.length,1);
  }finally{await db.close();}
});
test('known rejection retries; explicit NOT_APPLIED review unlocks uncertain credit with new operation', async () => {
  const {db,award,app,calls,store,gateway,ready}=await setup();try {
    const id=await award();gateway.assign=async c=>{calls.push(c);throw new BondaPointsError('INSUFFICIENT_FUNDS');};await app.processOne(id);assert.equal((await store.read(id))!.state,'PENDING');await ready();
    gateway.assign=async c=>{calls.push(c);throw new BondaPointsError('UNCERTAIN');};await app.processOne(id);const previous=(await store.read(id))!.operation_id!;
    const review={entryId:id,operationId:previous,outcome:'NOT_APPLIED' as const,reviewerId:customer,evidenceReference:'ticket/SYNTHETIC-2'};
    await assert.rejects(app.reconcile({...review,movementId:'30'},true));assert.equal(await app.reconcile(review,true),'RECONCILED');gateway.assign=async c=>{calls.push(c);return '31';};await app.processOne(id);
    assert.equal((await store.read(id))!.state,'CONFIRMED');assert.notEqual((await store.read(id))!.operation_id,previous);await assert.rejects(app.reconcile(review,true));assert.equal(calls.length,3);
  }finally{await db.close();}
});
test('leases fence workers and lost database acknowledgement never triggers resend', async () => {
  const {db,award,app,calls,store,pool,gateway}=await setup();try {
    const id=await award(),other=new PostgresBondaPointsStore(pool),token=(await store.claim(id))!;assert.equal(await other.claim(id),null);
    await db.exec("UPDATE bonda_point_credits SET lease_until=now()-interval '1 second'");const newer=(await other.claim(id))!;await assert.rejects(store.intent(id,token,credit));await store.release(id,token);assert.equal(await store.claim(id),null);await other.release(id,newer);
    store.confirm=async()=>{throw Error('synthetic DB failure');};await app.processOne(id);assert.equal((await store.read(id))!.state,'VERIFICATION_REQUIRED');await new BondaPointsApplication(config(),other,gateway).processDue(new Date(),25,'other');assert.equal(calls.length,1);
  }finally{await db.close();}
});
test('historic catch-up queues remaining unexpired lots without duplicating confirmed awards', async () => {
  const {db,award,app,store,calls}=await setup();try {
    const a=await award(300);await award(600);const expired=await award(900);await db.exec('DELETE FROM bonda_point_credits');
    await db.query('UPDATE point_lots SET remaining_points=100 WHERE source_ledger_entry_id=$1',[a]);await db.query("UPDATE point_lots SET expires_at=now()-interval '1 day' WHERE source_ledger_entry_id=$1",[expired]);
    assert.equal((await store.enqueueExisting(100)).enqueued,2);assert.equal((await store.read(a))?.points,'100');await app.processDue(new Date(),25,'test');assert.equal(calls.length,2);assert.equal((await store.enqueueExisting(100)).enqueued,0);
  }finally{await db.close();}
});
test('Bonda balance handles zero, cache, downgrade, identity change and outage without sending or double debit', async () => {
  const {db,award,app,gateway,calls,store}=await setup();try {
    await award();let reads=0;gateway.wallet=async()=>{reads++;return{id:'20',balance:'900',email:'synthetic@example.test'};};const values=await Promise.all([app.getBalance(customer),app.getBalance(customer)]);
    assert.equal(reads,1);assert.equal(values[0]!.available,'900');assert.equal(values[0]!.pending,'300');await app.getBalance(customer);assert.equal(reads,1);
    await db.exec("UPDATE bonda_point_balances SET observed_at=now()-interval '2 minutes'");gateway.wallet=async()=>{throw Error('offline');};const stale=await app.getBalance(customer);assert.equal(stale.status,'STALE');assert.equal(stale.available,'900');
    gateway.wallet=async()=>({id:'20',balance:'0',email:'synthetic@example.test'});await db.exec("UPDATE rewards_v2_journeys SET current_level='SILVER'");const spent=await app.getBalance(customer);assert.equal(spent.available,'0');assert.equal(spent.status,'FRESH');assert.equal(calls.length,0);assert.equal((await store.pending(customer)).pending,'300');
    await db.exec("UPDATE customers SET rewards_id='987654321'");assert.equal((await app.getBalance(customer)).available,null);
  }finally{await db.close();}
});
test('disabled runtime performs no I/O; missing balance is unknown; cache rejects older concurrent writes', async () => {
  const {db,app,store,gateway}=await setup();try {
    const disabled=new BondaPointsApplication(loadConfig({}).bonda!,{} as PostgresBondaPointsStore,{} as BondaPointsGateway);assert.equal((await disabled.getBalance(customer)).status,'DISABLED');assert.equal((await disabled.processDue(new Date(),25,'test')).processedJobs,0);
    gateway.wallet=async()=>{throw Error('offline');};assert.equal((await app.getBalance(customer)).available,null);
    const before=new Date(Date.now()-120000),now=new Date();await store.saveBalance(customer,'synthetic','123456789',{id:'20',balance:'100',email:null},now,now);await store.saveBalance(customer,'synthetic','123456789',{id:'20',balance:'999',email:null},before,new Date());assert.equal((await store.cached(customer,'synthetic','123456789'))?.balance,'100');
  }finally{await db.close();}
});

test('lost intent acknowledgement cannot reset a durable uncertain operation to pending', async () => {
  const {db,award,app,store,gateway,pool,calls}=await setup();try {
    const id=await award(),intent=store.intent.bind(store);
    store.intent=async (...args)=>{await intent(...args);throw Error('DB response lost after commit');};
    await app.processOne(id);assert.equal((await store.read(id))!.state,'VERIFICATION_REQUIRED');
    await new BondaPointsApplication(config(),new PostgresBondaPointsStore(pool),gateway).processDue(new Date(),25,'restart');
    assert.equal(calls.length,0);
  }finally{await db.close();}
});
