import assert from 'node:assert/strict';
import test from 'node:test';
import {loadConfig} from '../src/config.js';
import {CoursesApplication} from '../src/rewards/courses/application.js';
import {BondaActivitiesGateway} from '../src/rewards/courses/activities-gateway.js';
import {approvedCourses} from '../src/rewards/courses/catalog.js';
import {learningCatalog} from '../src/rewards/courses/learning-catalog.js';
import {wellnessCatalog} from '../src/rewards/courses/wellness-catalog.js';
import {courseSpace, courseContentType} from '../src/rewards/courses/types.js';
import {CourseError, courseText, courseImage, type CourseChapter} from '../src/rewards/courses/types.js';
import type {BondaCouponJourney} from '../src/rewards/bonda/catalog-application.js';
import {asCustomerId} from '../src/rewards/shared/identifiers.js';
import {rewardsLevels} from '../src/rewards/shared/enums.js';

const customer = asCustomerId('00000000-0000-0000-0000-000000000301');
const course = approvedCourses[0]!;
const chapter = course.chapters[0]!;
const fakeChapter: CourseChapter = {id:chapter.postId,number:1,title:chapter.title,summary:'Resumen',content:'Contenido',duration_seconds:100,presenters:[],embed_url:'https://player.vimeo.com/video/123?dnt=1'};

test('curated manifest has unique numeric IDs, complete ordered chapters, safe images and expected level counts', () => {
  const ids=new Set<number>();
  const postIds=new Set<string>();
  for(const course of approvedCourses){
    assert.ok(Number.isSafeInteger(course.id)); assert.ok(!ids.has(course.id)); ids.add(course.id);
    assert.equal(course.id,course.chapters[0]?.postId);
    assert.ok(courseImage(course.image));
    assert.ok(rewardsLevels.includes(course.minimumLevel));
    course.chapters.forEach((chapter,i)=>{
      assert.equal(chapter.number,i+1); assert.ok(chapter.durationSeconds>=0);
      const key=`${chapter.activityId}/${chapter.postId}`;assert.ok(!postIds.has(key));postIds.add(key);
    });
  }
  assert.equal(ids.size,249);assert.equal(postIds.size,434);
  assert.equal(approvedCourses.some(c=>c.category==='Programación'),false);
  for(const blocked of [204,363,382,976,979,984,968,163,697,110,123]) assert.ok(!postIds.has(`2/${blocked}`));
});

test('all six profiles inherit approved content without leaking playback in previews', async () => {
  let calls=0;
  const states: BondaCouponJourney[] = [{state:'INVITED',currentLevel:null},...rewardsLevels.map(currentLevel=>({state:'ACTIVE' as const,currentLevel}))];
  for(const [index,journey] of states.entries()){
    const app=new CoursesApplication({get:async()=>journey},{getChapter:async()=>{calls++;return fakeChapter;}},true);
    const catalog=await app.list(customer);
    assert.equal(catalog.courses.filter(c=>c.space === 'cursos' && c.accessible).length,[0,12,37,91,173,249][index]);
    assert.equal(catalog.courses.filter(c=>c.space === 'bienestar' && c.accessible).length,index === 0 ? 0 : 116);
    const json=JSON.stringify(catalog);
    assert.doesNotMatch(json,/embed_url|provider_external_id|postId|vimeo\.com\/video/);
  }
  assert.equal(calls,0,'catalog does not crawl the partner');
});

test('the 11 wellbeing-themed courses remain Cursos from Gold with original IDs and chapters', async () => {
  const thematic = approvedCourses.filter(c=>c.category==='Bienestar');
  assert.deepEqual(thematic.map(c=>c.id),[1404,1315,591,273,333,323,155,442,317,212,1391]);
  for(const course of thematic) {
    assert.equal(courseSpace(course),'cursos'); assert.equal(course.minimumLevel,'GOLD');
    assert.ok(course.chapters.every(c=>c.activityId===2));
    for(const currentLevel of rewardsLevels) {
      let reads=0;
      const app=new CoursesApplication({get:async()=>({state:'ACTIVE',currentLevel})},{getChapter:async c=>{reads++;return {...fakeChapter,id:c.postId};}},true);
      if(['BRONZE','SILVER'].includes(currentLevel)) {
        await assert.rejects(app.detail(customer,course.id),{status:403});assert.equal(reads,0);
      } else {assert.equal((await app.detail(customer,course.id)).course.space,'cursos');}
    }
  }
});

test('Wellness snapshot is complete, distinct, typed, Bronze-only minimum and safe for previews', () => {
  assert.equal(wellnessCatalog.length,116);
  assert.equal(wellnessCatalog.filter(c=>courseContentType(c)==='video').length,70);
  assert.equal(wellnessCatalog.filter(c=>courseContentType(c)==='text').length,46);
  assert.equal(new Set(learningCatalog.map(c=>c.id)).size,learningCatalog.length);
  for(const c of wellnessCatalog) {
    assert.equal(c.minimumLevel,'BRONZE');assert.equal(courseSpace(c),'bienestar');
    assert.equal(c.chapters.length,1);assert.equal(c.chapters[0]!.postId,c.id);
    assert.ok(courseImage(c.image));assert.ok(c.category.trim());
  }
  assert.doesNotMatch(JSON.stringify(wellnessCatalog),/provider_external_id|embed_url|codigo_afiliado|micrositio_id/);
});

test('Wellness videos and articles require active membership, including direct detail and progress URLs', async () => {
  for(const type of ['text','video'] as const) {
    const item=wellnessCatalog.find(c=>courseContentType(c)===type)!;
    for(const state of ['INVITED','BLOCKED','INACTIVE'] as const) {
      let reads=0;
      const app=new CoursesApplication({get:async()=>({state,currentLevel:'TITANIUM'})},{getChapter:async()=>{reads++;return fakeChapter;}},true);
      await assert.rejects(app.detail(customer,item.id),{status:403});
      await assert.rejects(app.getProgress(customer,item.id),{status:403});
      await assert.rejects(app.saveProgress(customer,item.id,{chapter_id:item.id,ranges:[],manual:true}),{status:403});
      assert.equal(reads,0);
    }
  }
  let saves=0;
  const article=wellnessCatalog.find(c=>courseContentType(c)==='text')!;
  const app=new CoursesApplication({get:async()=>({state:'ACTIVE',currentLevel:'BRONZE'})},{getChapter:async()=>({...fakeChapter,embed_url:null,duration_seconds:null})},true,learningCatalog,Date.now,{list:async()=>[],save:async()=>{saves++;throw Error('must not write');}});
  const result=await app.detail(customer,article.id);
  assert.equal(result.course.content_type,'text');assert.equal(result.progress,null);assert.equal(result.chapters[0]!.embed_url,null);
  await assert.rejects(app.getProgress(customer,article.id),{status:400});
  await assert.rejects(app.saveProgress(customer,article.id,{chapter_id:article.id,ranges:[],manual:true}),{status:400});
  assert.equal(saves,0);
});

test('direct access is denied for invited, blocked, inactive, unknown journey, insufficient level and unknown course', async () => {
  const silver=approvedCourses.find(c=>c.minimumLevel==='SILVER')!;
  let calls=0;
  for(const journey of [null,{state:'INVITED',currentLevel:null},{state:'BLOCKED',currentLevel:'TITANIUM'},{state:'INACTIVE',currentLevel:'TITANIUM'},{state:'ACTIVE',currentLevel:'BRONZE'}] as (BondaCouponJourney|null)[]){
    const app=new CoursesApplication({get:async()=>journey},{getChapter:async()=>{calls++;return fakeChapter;}},true);
    await assert.rejects(app.detail(customer,silver.id),CourseError);
    await assert.rejects(app.detail(customer,999999),{status:404});
  }
  assert.equal(calls,0);
});

test('detail cache coalesces requests, expires, and rechecks authorization even when warm', async () => {
  let time=0,calls=0;
  let journey:BondaCouponJourney={state:'ACTIVE',currentLevel:'BRONZE'};
  const app=new CoursesApplication({get:async()=>journey},{getChapter:async c=>{calls++;return {...fakeChapter,id:c.postId,number:c.number};}},true,approvedCourses,()=>time);
  const [a,b]=await Promise.all([app.detail(customer,course.id),app.detail(customer,course.id)]);
  assert.deepEqual(a,b);assert.equal(calls,3);assert.equal(a.chapters.length,3);
  time=300001;await app.detail(customer,course.id);assert.equal(calls,6);
  journey={state:'BLOCKED',currentLevel:'TITANIUM'};
  await assert.rejects(app.detail(customer,course.id),{status:403});assert.equal(calls,6);
});

test('partial series failure is not cached or returned; retry can recover', async () => {
  let fail=true;
  const app=new CoursesApplication({get:async()=>({state:'ACTIVE',currentLevel:'TITANIUM'})},{getChapter:async c=>{
    if(fail&&c.number===2)throw new CourseError(503,'courses_unavailable');return {...fakeChapter,id:c.postId,number:c.number};
  }},true);
  await assert.rejects(app.detail(customer,course.id),{status:503});
  fail=false;assert.equal((await app.detail(customer,course.id)).chapters.length,3);
});

test('disabled flag does not read journey or partner and enabled configuration requires credentials', async () => {
  const never=async()=>{throw Error('must not call');};
  const app=new CoursesApplication({get:never},{getChapter:never},false);
  assert.equal((await app.list(customer)).status,'DISABLED');
  await assert.rejects(app.detail(customer,course.id),{status:503});
  assert.throws(()=>loadConfig({BONDA_COURSES_ENABLED:'true'}));
});

const config=loadConfig({BONDA_COURSES_ENABLED:'true',BONDA_COUPON_API_KEY:'secret-key',BONDA_MICROSITE_ID:'site',BONDA_CATALOG_AFFILIATE_CODE:'member'}).bonda!;
const valid={id:chapter.postId,titulo:chapter.title,tipo:'video',descripcion_breve:'<b>Hola</b>',contenido:'<script>alert(1)</script><p>Texto</p>',ponentes:[{nombre:'Docente'}],payload:{proveedor:'vimeo',provider_external_id:'123456',duracion:120}};
test('Activities gateway uses documented endpoint and returns only safe normalized data', async () => {
  const gateway=new BondaActivitiesGateway(config,async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.pathname,`/api/actividades/2/posts/${chapter.postId}`);
    assert.equal(url.searchParams.get('codigo_afiliado'),'member');assert.equal(init?.redirect,'error');
    return Response.json(valid);
  });
  const result=await gateway.getChapter(chapter);
  assert.equal(result.embed_url,'https://player.vimeo.com/video/123456?dnt=1');assert.equal(result.content,'Texto');
  assert.equal(result.summary,'Hola');assert.doesNotMatch(JSON.stringify(result),/secret-key|member/);
});

test('invalid partner content and hostile destinations fail without leaking credentials',async()=>{
  for(const body of [{...valid,id:9},{...valid,titulo:'Replaced course'},{...valid,payload:{...valid.payload,provider_external_id:'123?key=evil'}},{...valid,payload:null}]){
    const gateway=new BondaActivitiesGateway(config,async()=>Response.json(body));
    await assert.rejects(gateway.getChapter(chapter),{status:503,message:'courses_unavailable'});
  }
  let calls=0;
  const gateway=new BondaActivitiesGateway({...config,baseUrl:'https://evil.example'},async()=>{calls++;return Response.json(valid);});
  await assert.rejects(gateway.getChapter(chapter),CourseError);assert.equal(calls,0);
  const failed=new BondaActivitiesGateway(config,async()=>{throw Error('secret-key');});
  await assert.rejects(failed.getChapter(chapter),{message:'courses_unavailable'});
  assert.equal(courseImage('javascript:alert(1)'),null);assert.equal(courseImage('https://i.vimeocdn.com.evil/a'),null);
  assert.equal(courseText('<script>x</script><b>Seguro</b>'),'Seguro');
});

test('Wellness articles use the activity 1 endpoint and never expose playback or foreign HTML', async()=>{
  const article=wellnessCatalog.find(c=>courseContentType(c)==='text')!.chapters[0]!;
  const body={id:article.postId,titulo:article.title,tipo:'text',descripcion_breve:'Resumen',contenido:'<p>Primero</p><script>evil()</script><p>Segundo</p>',payload:null};
  const gateway=new BondaActivitiesGateway(config,async(input)=>{
    assert.equal(new URL(String(input)).pathname,`/api/actividades/1/posts/${article.postId}`);
    return Response.json(body);
  });
  const result=await gateway.getChapter(article);
  assert.equal(result.embed_url,null);assert.equal(result.duration_seconds,null);
  assert.match(result.content,/Primero\n+Segundo/);assert.doesNotMatch(result.content,/script|evil|<p>/);
  for(const invalid of [{...body,tipo:'video'},{...body,id:0},{...body,titulo:'Changed'},{...body,contenido:''}])
    await assert.rejects(new BondaActivitiesGateway(config,async()=>Response.json(invalid)).getChapter(article),{status:503});
});
