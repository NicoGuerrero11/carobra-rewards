import assert from 'node:assert/strict';
import test from 'node:test';
import {courseProgress,courseContinuation,nextProgress,progressInput,type ProgressStore,type VideoProgress} from '../src/rewards/courses/progress.js';
import {progressCsv,reportOptions} from '../src/rewards/courses/progress-report.js';
import {approvedCourses} from '../src/rewards/courses/catalog.js';
import {learningCatalog} from '../src/rewards/courses/learning-catalog.js';
import {wellnessCatalog} from '../src/rewards/courses/wellness-catalog.js';
import {CoursesApplication} from '../src/rewards/courses/application.js';
import {asCustomerId} from '../src/rewards/shared/identifiers.js';
import type {BondaCouponJourney} from '../src/rewards/bonda/catalog-application.js';

const course=approvedCourses[0]!;
const id=course.chapters[0]!.postId;
const customer=asCustomerId('00000000-0000-0000-0000-000000000301');
const other=asCustomerId('00000000-0000-0000-0000-000000000302');
const at='2026-09-23T12:00:00.000Z';
test('continuation ignores empty/obsolete rows, resumes unfinished chapters and respects manual completion', async()=>{
  const first=nextProgress(undefined,course.id,{chapter_id:id,ranges:[],manual:true},100,at);
  const secondId=course.chapters[1]!.postId;
  const second=nextProgress(undefined,course.id,{chapter_id:secondId,ranges:[[30,50]],manual:false},100,'2026-09-24T12:00:00.000Z');
  const empty=nextProgress(undefined,course.id,{chapter_id:secondId,ranges:[],manual:false},100,at);
  assert.deepEqual(courseContinuation(course,[empty,{...first,chapter_id:999999}]),{started:false,last_activity_at:null,resume_chapter_number:null});
  assert.deepEqual(courseContinuation(course,[first]),{started:true,last_activity_at:at,resume_chapter_number:2});
  assert.equal(courseContinuation(course,[first,second]).resume_chapter_number,2);
  assert.equal(courseContinuation(course,[first,second]).last_activity_at,second.updated_at);
  assert.equal(first.watched_seconds,0);
  assert.equal(courseContinuation(course,course.chapters.map(ch=>({...first,chapter_id:ch.postId}))).resume_chapter_number,null);
  const before=JSON.stringify([first,second]);
  let partnerReads=0;
  const app=new CoursesApplication({get:async()=>({state:'ACTIVE',currentLevel:'BRONZE'})},{getChapter:async()=>{partnerReads++;throw Error('not needed');}},true,[course],Date.now,
    {list:async c=>c===customer?[first,second]:[],save:async()=>{throw Error('must not write');}});
  const preview=(await app.list(customer)).courses[0]!;
  assert.equal(preview.progress?.started,true);assert.equal(preview.progress?.resume_chapter_number,2);
  assert.equal((await app.list(other)).courses[0]!.progress?.started,false);
  assert.equal(partnerReads,0);assert.equal(JSON.stringify([first,second]),before);
});
test('automatic completion starts exactly at 80% distinct coverage across sessions',()=>{
  let row=nextProgress(undefined,course.id,{chapter_id:id,ranges:[[0,79.999]],manual:false},100,at);
  assert.equal(row.playback_completed_at,null);
  row=nextProgress(row,course.id,{chapter_id:id,ranges:[[20,80]],manual:false},100,at);
  assert.equal(row.watched_seconds,80);
  assert.equal(row.playback_completed_at,at);
  assert.equal(row.manual_completed_at,null);
});
test('union is idempotent across sessions and manual never inflates playback',()=>{
  let row=nextProgress(undefined,course.id,{chapter_id:id,ranges:[[0,40],[20,60]],manual:false},100,at);
  assert.equal(row.watched_seconds,60);assert.equal(row.playback_completed_at,null);
  row=nextProgress(row,course.id,{chapter_id:id,ranges:[[30,70]],manual:true},100,at);
  assert.equal(row.watched_seconds,70);assert.equal(row.manual_completed_at,at);assert.equal(row.playback_completed_at,null);
  row=nextProgress(row,course.id,{chapter_id:id,ranges:[[0,40],[65,90]],manual:false},100,'2026-09-23T13:00:00.000Z');
  assert.equal(row.watched_seconds,90);assert.equal(row.manual_completed_at,at);assert.equal(row.playback_completed_at,'2026-09-23T13:00:00.000Z');
  assert.deepEqual(nextProgress(row,course.id,{chapter_id:id,ranges:[[0,20]],manual:true},100,row.updated_at),row);
  assert.equal(courseProgress(course,[row]).completed,false);
  assert.equal(courseProgress(course,course.chapters.map(ch=>({...row,chapter_id:ch.postId}))).completed,true);
});
test('seek-only final seconds do not complete; unknown duration permits manual only',()=>{
  const row=nextProgress(undefined,course.id,{chapter_id:id,ranges:[[95,100]],manual:false},100,at);
  assert.equal(row.playback_completed_at,null);assert.equal(row.watched_seconds,5);
  assert.equal(nextProgress(undefined,course.id,{chapter_id:id,ranges:[],manual:true},null,at).manual_completed_at,at);
  assert.throws(()=>nextProgress(undefined,course.id,{chapter_id:id,ranges:[[0,1000]],manual:false},100,at));
  assert.throws(()=>nextProgress(undefined,course.id,{chapter_id:id,ranges:[[0,1]],manual:false},null,at));
});
test('input rejects identity spoofing, unbounded ranges and malformed payloads',()=>{
  const valid={chapter_id:id,ranges:[[0,20]],manual:false};
  assert.deepEqual(progressInput(valid),valid);
  for(const value of [null,[],{...valid,customer_id:other},{...valid,manual:'true'},{...valid,chapter_id:1.5},
    {...valid,ranges:[[0,Infinity]]},{...valid,ranges:[[3,2]]},{...valid,ranges:[[-1,1]]},{...valid,ranges:Array(257).fill([0,1])}]) assert.throws(()=>progressInput(value));
});
test('every read/write checks current authorization and customer identity; storage failure does not hide media',async()=>{
  let journey:BondaCouponJourney={state:'ACTIVE',currentLevel:'TITANIUM'};
  const data=new Map<string,VideoProgress[]>();let broken=false,saves=0;
  const store:ProgressStore={list:async customer=>{if(broken)throw Error('db secret');return data.get(customer)??[];},save:async(customer,courseId,input,duration)=>{
    if(broken)throw Error('db secret');saves++;const row=nextProgress(undefined,courseId,input,duration,at);data.set(customer,[row]);return row;
  }};
  const app=new CoursesApplication({get:async()=>journey},{getChapter:async ch=>({id:ch.postId,number:ch.number,title:ch.title,summary:'',content:'',duration_seconds:100,presenters:[],embed_url:'https://player.vimeo.com/video/123?dnt=1'})},true,approvedCourses,Date.now,store);
  await app.saveProgress(customer,course.id,{chapter_id:id,ranges:[],manual:true});
  assert.equal((await app.getProgress(customer,course.id)).completed_chapters,1);
  assert.equal((await app.getProgress(other,course.id)).completed_chapters,0);
  await assert.rejects(app.saveProgress(customer,course.id,{chapter_id:999999,ranges:[],manual:true}),{status:404});
  for(const state of ['INVITED','BLOCKED','INACTIVE'] as const){
    journey={state,currentLevel:'TITANIUM'};
    await assert.rejects(app.getProgress(customer,course.id),{status:403});
    await assert.rejects(app.saveProgress(customer,course.id,{chapter_id:id,ranges:[],manual:true}),{status:403});
  }
  journey={state:'ACTIVE',currentLevel:'BRONZE'};
  const silver=approvedCourses.find(c=>c.minimumLevel==='SILVER')!;
  await assert.rejects(app.saveProgress(customer,silver.id,{chapter_id:silver.chapters[0]!.postId,ranges:[],manual:true}),{status:403});
  assert.equal(saves,1);
  broken=true;
  assert.equal((await app.list(customer)).progress_available,false);
  assert.equal((await app.detail(customer,course.id)).progress,null);
  await assert.rejects(app.saveProgress(customer,course.id,{chapter_id:id,ranges:[],manual:true}),{status:503,message:'progress_unavailable'});
});
test('operator report bounds and CSV are safe, with separate provenance',()=>{
  assert.deepEqual(reportOptions(['--course-id','1256','--limit','5','--offset','10']),{courseId:1256,customerId:null,limit:5,offset:10});
  for(const args of [['--limit','1001'],['--course-id','0'],['--customer-id','SQL'],['--offset','-1'],['--unknown','1']]) assert.throws(()=>reportOptions(args));
  const csv=progressCsv([{customer_id:'=formula',course_id:course.id,chapter_id:id,watched_seconds:45,duration_seconds:100,manual_completed_at:at}]);
  assert.match(csv,/"'=formula"/);assert.match(csv,/"45"/);assert.match(csv,/manual_completed_at/);assert.match(csv,/playback_completed_at/);
});

test('moving thematic courses preserves saved completion; Bronze wellness videos use the same progress rules',async()=>{
  const thematic=approvedCourses.find(c=>c.id===273)!;
  const saved=nextProgress(undefined,thematic.id,{chapter_id:thematic.chapters[0]!.postId,ranges:[],manual:true},100,at);
  const rows=[saved];
  const store:ProgressStore={list:async()=>rows,save:async(_customer,courseId,input,duration)=>{
    const row=nextProgress(undefined,courseId,input,duration,at);rows.push(row);return row;
  }};
  let currentLevel:'GOLD'|'BRONZE'='GOLD';
  const app=new CoursesApplication({get:async()=>({state:'ACTIVE',currentLevel})},{getChapter:async ch=>({id:ch.postId,number:ch.number,title:ch.title,summary:'',content:'',duration_seconds:100,presenters:[],embed_url:'https://player.vimeo.com/video/123?dnt=1'})},true,learningCatalog,Date.now,store);
  const moved=(await app.list(customer)).courses.find(c=>c.id===273)!;
  assert.equal(moved.space,'cursos');assert.equal(moved.progress?.completed,true);
  assert.deepEqual((await app.getProgress(customer,273)).chapters,[saved]);
  currentLevel='BRONZE';
  await assert.rejects(app.getProgress(customer,273),{status:403});
  const video=wellnessCatalog.find(c=>c.chapters[0]?.contentType==='video')!;
  const result=await app.saveProgress(customer,video.id,{chapter_id:video.id,ranges:[[0,80]],manual:false});
  assert.equal(result.completed,true);assert.equal(result.chapters[0]!.playback_completed_at,at);
  assert.equal(result.chapters[0]!.manual_completed_at,null);
  assert.deepEqual(rows[0],saved,'existing course progress is untouched');
  assert.match(progressCsv([{customer_id:customer,course_id:video.id,chapter_id:video.id}]),new RegExp(video.title));
});
