import assert from 'node:assert/strict';
import test from 'node:test';
import {once} from 'node:events';
import {createSiteBackendServer} from '../src/app.js';
import type {RewardsCustomerPortalApplication} from '../src/rewards/v2/customer-portal.js';
import type {RewardsV2JourneyHttpApplication} from '../src/rewards/v2/journey-http-application.js';
import type {BondaCouponHttpApplication} from '../src/rewards/bonda/catalog-application.js';
import type {CoursesApplication} from '../src/rewards/courses/application.js';

type Context = {after: (fn:()=>Promise<void>)=>void};
const customer='00000000-0000-4000-8000-000000000901';
async function fixture(t: Context, options: {holdPortal?: boolean; noPortal?: boolean; failedCourses?: boolean}={}) {
  const calls: string[]=[];
  let identityReads=0,revoked=false,release!:()=>void,ready!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve);
  const portalStarted=new Promise<void>(resolve=>ready=resolve);
  let moduleReady!:()=>void;
  const modulesStarted=new Promise<void>(resolve=>moduleReady=resolve);
  let moduleCount=0;
  const mark=(name:string)=>{calls.push(name);if(++moduleCount===2)moduleReady();};
  const portal={getPortal:async(id:string)=>{
    assert.equal(id,customer);calls.push('portal');ready();
    if(options.holdPortal)await gate;
    return options.noPortal?null:{marker:id};
  }} as unknown as RewardsCustomerPortalApplication;
  const journey={synchronize:async()=>{calls.push('synchronize');}} as unknown as RewardsV2JourneyHttpApplication;
  const coupons={getCatalog:async(identity:{customerId:string},_page:number,size:number,preview:boolean)=>{
    assert.equal(identity.customerId,customer);assert.equal(calls[0],'synchronize');
    mark(preview?'preview':'catalog');
    return {access_state:'AVAILABLE',affiliate_state:'ACTIVE',items:[{id:'synthetic'}],page_size:size};
  },getHistory:async()=>{assert.ok(calls.includes('catalog'));calls.push('history');return {items:[]};}} as unknown as BondaCouponHttpApplication;
  const courses={list:async(id:string)=>{assert.equal(id,customer);assert.equal(calls[0],'synchronize');mark('courses');if(options.failedCourses)throw Error('synthetic failure');return {status:'AVAILABLE',courses:[]};}} as unknown as CoursesApplication;
  const server=createSiteBackendServer({apiBaseUrl:'http://identity.invalid',apiRequestTimeoutMs:1000,host:'127.0.0.1',port:0,sessionCookie:{name:'carobra_session',secure:false,sameSite:'lax',path:'/'}},async url=>{
    identityReads++;
    if(revoked)return Response.json({detail:{code:'unauthenticated'}},{status:401});
    return Response.json(String(url).endsWith('validation-status')?{customer_id:customer,status:'VALIDATED',registered_at:'2026-07-01T00:00:00Z',product_evidence:null}:{id:customer,rewards_id:'123456789',customer_status:'ACTIVE'});
  },undefined,undefined,journey,portal,undefined,coupons,courses);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{release();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const request=(page:string)=>fetch(`http://127.0.0.1:${address.port}/api/v1/rewards/customer-context?include=${page}`,{headers:{cookie:'carobra_session=synthetic'}});
  return {request,calls,portalStarted,modulesStarted,release,identityReads:()=>identityReads,revoke:()=>revoked=true};
}

test('page context reuses one fresh identity and starts independent home reads after sync, before portal completion', {timeout:3000}, async t=>{
  const f=await fixture(t,{holdPortal:true});
  const pending=f.request('home');await f.modulesStarted;
  assert.deepEqual(f.calls,['synchronize','preview','courses','portal']);
  assert.equal(f.identityReads(),2);f.release();
  const response=await pending;assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/no-store/);
  const value=await response.json() as any;
  assert.equal(value.portal.marker,customer);assert.equal(value.navigation_modules.coupons.data.page_size,4);
  assert.equal(value.navigation_modules.courses.status,200);
  await f.request('home');assert.equal(f.identityReads(),4);
  f.revoke();assert.equal((await f.request('home')).status,401);assert.equal(f.calls.length,8);
});

test('benefits retain portal -> catalog -> history side-effect ordering and reuse request identity', {timeout:3000},async t=>{
  const f=await fixture(t,{holdPortal:true});const pending=f.request('benefits');await f.portalStarted;
  assert.deepEqual(f.calls,['synchronize','portal']);f.release();
  const value=await (await pending).json() as any;
  assert.deepEqual(f.calls,['synchronize','portal','catalog','history']);assert.equal(f.identityReads(),2);
  assert.equal(value.navigation_modules.history.status,200);assert.equal(value.navigation_modules.coupons.data.page_size,50);
});

test('failed portal never starts benefit provisioning/history; independent module errors stay explicit',async t=>{
  const f=await fixture(t,{noPortal:true});const value=await (await f.request('benefits')).json() as any;
  assert.deepEqual(f.calls,['synchronize','portal']);assert.deepEqual(value.navigation_modules.coupons,{status:503,data:null});
  const partial=await fixture(t,{failedCourses:true});const home=await (await partial.request('home')).json() as any;
  assert.equal(home.navigation_modules.coupons.status,200);assert.deepEqual(home.navigation_modules.courses,{status:503,data:null});
});
