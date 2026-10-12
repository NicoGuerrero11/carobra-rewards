// Synthetic SSR + real BFF/summary/points applications. No provider or DB network.
// Run with Node 24: node tests/performance/navigation.mjs <checkout> <output.json>
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
const root = resolve(process.argv[2]);
const load = path => import(pathToFileURL(`${root}/${path}`));
const {createSiteBackendServer} = await load('site-backend/dist/src/app.js');
const {PostgresRewardsJourneySummaryQuery} = await load('site-backend/dist/src/rewards/v2/journey-summary.js');
const {BondaPointsApplication} = await load('site-backend/dist/src/rewards/bonda/points-application.js');
// Reuse only synthetic data builders; never start the fixture's HTTP listener.
let source = await readFile(`${root}/site-frontend/tests/support/mock-site-backend.mjs`, 'utf8');
source = source.replace('server.listen(port, host);', '');
source += '\nexport {portalFor, eligibleProfile, validationFor, coupon};';
const fixture = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const profile = {...fixture.eligibleProfile, rewards_id:'123456789'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let scenario, cached = null, calls;
const counts = () => ({identity:0, portal:0, wallet:0, catalog:0, history:0, courses:0, sql:0});
const database = {query: async sql => {
  calls.sql++; await sleep(10);
  if(sql.includes('FROM rewards_v2_journeys')) return {rows:[{state:'ACTIVE', current_level:'GOLD', redemption_eligible:true, registered_at:new Date('2026-07-01'),account_id:'fixture',available_points:'1000',reserved_points:'0'}]};
  if(sql.includes('FROM rewards_product_facts')) return {rows:[{product_type:'AFORE',status:'ACTIVE',activated_at:new Date('2026-07-01')}]};
  return {rows:[]};
}};
const points = new BondaPointsApplication({micrositeId:'synthetic',points:{balanceEnabled:true,sendEnabled:false}}, {
  pending:async()=>({pending:'0',uncertain:'0'}),
  context:async()=>({rewards_id:'123456789',customer_status:'ACTIVE',affiliate_state:'ACTIVE'}),
  cached:async()=>cached,
  saveBalance:async(_a,_b,_c,wallet,_started,observed)=>{cached={balance:wallet.balance,observed_at:observed};},
}, {wallet:async()=>{calls.wallet++; await sleep(scenario.wallet);if(scenario.fail) throw Error('synthetic outage');return {id:'20',balance:'900',email:null};}});
const summary = new PostgresRewardsJourneySummaryQuery(database,{listEffectiveFeatureFlags:async()=>[]},{now:()=>new Date()},points);
const portal = {getPortal:async(id,status)=>{calls.portal++;const result=fixture.portalFor(fixture.eligibleProfile);result.journey=await summary.getForCustomer(id,status);return result;}};
const couponItems=Array.from({length:4},(_,i)=>fixture.coupon(`synthetic-${i+1}`,`Beneficio sintético ${i+1}`,'10%','Prueba','Fixture local sin proveedor'));
const courseItems=Array.from({length:12},(_,i)=>({id:1000+i,title:`Curso sintético ${i+1}`,space:'cursos',content_type:'video',category:'Prueba',minimum_level:'BRONZE',summary:'Contenido sintético local',image_url:null,chapter_count:1,duration_seconds:600,accessible:true,progress:null}));
const coupons = {getHistory:async()=>{calls.history++;await sleep(30);return {items:[]};},getCatalog:async()=>{calls.catalog++;await sleep(scenario.catalog);return {current_level:'GOLD',access_state:scenario.fail?'PARTNER_UNAVAILABLE':'AVAILABLE',affiliate_state:'ACTIVE',items:scenario.fail?[]:couponItems,refreshed_at:null,page:1,page_size:50,total:scenario.fail?0:couponItems.length,next_page:null};}};
const courses = {list:async()=>{calls.courses++;await sleep(scenario.catalog);if(scenario.fail) throw Error('synthetic courses failure');return {status:'AVAILABLE',current_level:'GOLD',reviewed_at:'2026-10-08',courses:courseItems};}};
const config={apiBaseUrl:'http://identity.invalid',apiRequestTimeoutMs:1000,sessionCookie:{name:'carobra_session',secure:false,sameSite:'lax',path:'/'}};
const bff=createSiteBackendServer(config,async url=>{calls.identity++;await sleep(25);return new Response(JSON.stringify(String(url).endsWith('validation-status')?fixture.validationFor(fixture.eligibleProfile):profile),{status:200});},undefined,undefined,undefined,portal,undefined,coupons,courses,points);
bff.listen(0,'127.0.0.1');await once(bff,'listening');
process.env.SITE_BACKEND_BASE_URL=`http://127.0.0.1:${bff.address().port}`;
const configPath=`${root}/site-frontend/.vercel/output/functions/_render.func/.vc-config.json`;
const {handler}=JSON.parse(await readFile(configPath,'utf8'));
const {default:app}=await import(new URL(handler,pathToFileURL(configPath)));
const paths=['recompensas','beneficios','cursos','productos','activities'];
const records=[];
try {
  for(scenario of [{name:'healthy',wallet:150,catalog:80,fail:false},{name:'slow',wallet:1200,catalog:3000,fail:false},{name:'outage',wallet:1200,catalog:3000,fail:true}]) {
    for(const mode of ['cold','warm']) {
      cached=null;
      for(let sample=0;sample<3;sample++) for(const path of paths) {
        if(mode==='cold') cached=null;
        calls=counts();
        const cookie=`carobra_session=synthetic-${scenario.name}-${mode}${mode==='cold'?`-${sample}-${path}`:''}`;
        const start=performance.now();
        const response=await app.fetch(new Request(`http://localhost/cliente/${path}`,{headers:{cookie}}));
        const headersMs=performance.now()-start;
        const html=await response.text();
        assert.equal(response.status, 200);
        if (mode === 'cold') assert.equal(calls.portal >= 1, true, 'fixture must reach the portal');
        const totalMs=performance.now()-start;
        if (!scenario.fail && ['recompensas','beneficios'].includes(path)) assert.match(html,/Beneficio sintético 1/);
        if (!scenario.fail && path==='recompensas') assert.match(html,/Curso sintético 1/);
        const contentFailure = path === 'beneficios' ? !html.includes('Beneficio sintético 1') : {
          recompensas:/No pudimos cargar los beneficios en este momento|No pudimos cargar estos contenidos/,
          beneficios:/No pudimos actualizar tus beneficios/,
          cursos:/No pudimos cargar tus cursos/,
          productos:/No pudimos cargar tus productos/,
          activities:/No pudimos cargar tu actividad/,
        }[path].test(html);
        assert.equal(contentFailure, scenario.fail && ['recompensas','beneficios','cursos'].includes(path), 'content completion must match actual fixture delivery');
        const balanceStatus=html.match(/data-bonda-status="([^"]+)"/)?.[1] ?? null;
        const record={scenario:scenario.name,mode,sample,path,status:response.status,headersMs,totalMs,timing:response.headers.get('server-timing'),bytes:Buffer.byteLength(html),calls:{...calls},contentReady:!contentFailure,serverContentMs:contentFailure?null:totalMs,balanceStatus,balanceRefreshMs:null,balanceReady:balanceStatus===null||balanceStatus==='FRESH',allDisplayedDataMs:null};
        // Simulate the separate HTTP balance read after HTML, without pretending
        // to execute browser JS or measure paint. This also warms the same store.
        if (typeof points.getStoredBalance === 'function' && ['STALE','UNAVAILABLE'].includes(balanceStatus)) {
          const refreshStart=performance.now();
          const refresh=await app.fetch(new Request('http://localhost/api/v1/rewards/bonda-balance',{headers:{cookie}}));
          assert.equal(refresh.status,200);
          const value=await refresh.json();
          record.balanceRefreshMs=performance.now()-refreshStart;
          record.balanceReady=value.status==='FRESH';
          record.deferredCalls=Object.fromEntries(Object.keys(calls).map(key=>[key,calls[key]-record.calls[key]]));
        }
        record.allDisplayedDataMs=record.contentReady&&record.balanceReady?totalMs+(record.balanceRefreshMs??0):null;
        records.push(record);
      }
    }
    console.log(`measured ${scenario.name}`);
  }
  await writeFile(process.argv[3],JSON.stringify({runtime:process.version,conditions:{identityMs:25,sqlMs:10,historyMs:30,couponItems:4,courseItems:12,samples:3,cache:'cold resets balance + session; warm reuses both; sequential five-route journeys',browser:false,balance:'after HTML, simulate deferred same-origin HTTP refresh where a balance component is stale or unknown; no JS or paint measurement'},records},null,2));
} finally {bff.closeAllConnections();bff.close();}
