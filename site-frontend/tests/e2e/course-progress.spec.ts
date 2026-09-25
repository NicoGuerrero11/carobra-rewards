import {test,expect,type Page} from '@playwright/test';

test.beforeEach(async({page,context},info)=>{
  await context.addCookies([{name:'carobra_session',value:'e2e-eligible',url:'http://127.0.0.1:4322'},
    {name:'progress-test',value:`${info.project.name}-${Date.now()}-${Math.random()}`,url:'http://127.0.0.1:4322'}]);
  await page.route('https://player.vimeo.com/**',r=>r.fulfill({contentType:'text/html',body:`<button>Video de prueba</button><script>
    addEventListener('message',e=>{let d=e.data;if(typeof d==='string')d=JSON.parse(d);
    if(d.method)parent.postMessage({method:d.method,value:d.method==='getPlaybackRate'?1:true},'*');});
    parent.postMessage({event:'ready'},'*');</script>`}));
  await page.route('https://i.vimeocdn.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"/>'}));
});

async function event(page:Page,name:string,seconds:number){
  const frame=page.frames().find(f=>f.url().includes('player.vimeo.com'))!;
  await frame.evaluate(({name,seconds})=>parent.postMessage({event:name,data:{seconds,duration:600,percent:seconds/600}},'*'),{name,seconds});
  await page.waitForTimeout(10);
}

test('manual completion persists across reload and chapters; complete means every video',async({page},info)=>{
  await page.goto('/cliente/cursos/1256');
  const description=await page.locator('[data-chapter-panel="1"]').boundingBox();
  const completion=await page.locator('[data-course-progress]').boundingBox();
  expect(completion!.y).toBeGreaterThanOrEqual(description!.y+description!.height);
  await page.getByRole('button',{name:'Marcar como completado',exact:true}).click();
  await expect(page.locator('#video-progress-status')).toHaveText('✓ Completado');
  await expect(page.locator('#mark-video-seen')).toBeHidden();
  await expect(page.locator('[data-course-progress]')).not.toContainText(/%|automáticamente|Marcado por ti|reproducción registrada/);
  const saved=await (await page.request.get('/api/v1/rewards/courses/1256/progress')).json();
  expect(saved.chapters[0].watched_seconds).toBe(0);
  expect(saved.chapters[0].manual_completed_at).toBeTruthy();
  expect(saved.chapters[0].playback_completed_at).toBeNull();
  await page.reload();
  await expect(page.locator('#video-progress-status')).toHaveText('✓ Completado');
  await expect(page.locator('#course-progress-summary')).toContainText('1 de 3');
  for(const chapter of [2,3]) {
    await page.locator(`[data-chapter="${chapter}"]`).click();
    await page.getByRole('button',{name:'Marcar como completado',exact:true}).click();
    await expect(page.locator('#video-progress-status')).toHaveText('✓ Completado');
  }
  await expect(page.locator('#course-progress-summary')).toContainText('Curso completado');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('course-progress.png'),fullPage:true});
  await page.goto('/cliente/cursos?tipo=cursos');
  await expect(page.getByText('✓ Curso completado',{exact:true})).toBeVisible();
});

test('failed save is not confirmed and can retry; cross-origin writes are rejected',async({page,context})=>{
  await page.goto('/cliente/cursos/1256');
  await context.addCookies([{name:'progress-failure',value:'true',url:'http://127.0.0.1:4322'}]);
  await page.getByRole('button',{name:'Marcar como completado',exact:true}).click();
  await expect(page.locator('#progress-feedback')).toContainText('No pudimos guardar');
  await expect(page.locator('#video-progress-status')).toHaveText('Sin completar');
  await context.clearCookies({name:'progress-failure'});
  await page.getByRole('button',{name:'Reintentar guardado',exact:true}).click();
  await expect(page.locator('#video-progress-status')).toHaveText('✓ Completado');
  const response=await page.request.post('/api/v1/rewards/courses/1256/progress',{headers:{origin:'https://other.example','x-carobra-action':'course-progress'},data:{chapter_id:1257,ranges:[],manual:true}});
  expect(response.status()).toBe(403);
});

test('Vimeo SDK ignores a seek to the end and auto-completes 80% continuous coverage',async({page})=>{
  await page.goto('/cliente/cursos/1256');
  await expect(page.locator('#course-player')).toHaveAttribute('data-ready','true');
  await page.clock.install();
  await event(page,'playing',0);await event(page,'seeking',590);await event(page,'seeked',590);
  await page.clock.runFor(1000);await event(page,'timeupdate',591);await event(page,'ended',600);
  await expect(page.locator('#mark-video-seen')).toHaveText('Marcar como completado');
  await event(page,'playing',0);
  for(let seconds=3;seconds<=480;seconds+=3){
    await page.clock.runFor(3000);await event(page,'timeupdate',seconds);
    if(seconds===477) await expect(page.locator('#video-progress-status')).toHaveText('Sin completar');
  }
  await expect(page.locator('#video-progress-status')).toHaveText('✓ Completado');
  await expect(page.locator('#mark-video-seen')).toBeHidden();
  await expect(page.locator('[data-course-progress]')).not.toContainText(/%|automáticamente|reproducción registrada/);
  const saved=await (await page.request.get('/api/v1/rewards/courses/1256/progress')).json();
  expect(saved.chapters[0].watched_seconds).toBeGreaterThanOrEqual(480);
  expect(saved.chapters[0].manual_completed_at).toBeNull();
  expect(saved.chapters[0].playback_completed_at).toBeTruthy();
  await page.reload();
  await expect(page.locator('#video-progress-status')).toHaveText('✓ Completado');
});

test('background save keeps the action enabled and drains completion queued at playback end',async({page},info)=>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let captured=false;
  await page.route('**/api/v1/rewards/courses/1256/progress',async route=>{
    if(route.request().method()==='POST' && !captured){captured=true;await gate;}
    await route.continue();
  });
  await page.goto('/cliente/cursos/1256');
  await expect(page.locator('#course-player')).toHaveAttribute('data-ready','true');
  await page.clock.install();
  // Model a resumed session whose confirmed ranges are already close to the threshold.
  // Seed only the test backend; production is never involved.
  await page.request.post('/api/v1/rewards/courses/1256/progress',{headers:{origin:'http://127.0.0.1:4322','x-carobra-action':'course-progress'},data:{chapter_id:1256,ranges:[[0,475]],manual:false}});
  await page.reload();
  await expect(page.locator('#course-player')).toHaveAttribute('data-ready','true');
  await event(page,'playing',475);
  await page.clock.runFor(1000);await event(page,'timeupdate',476);
  await event(page,'pause',476);
  await expect.poll(()=>captured).toBe(true);
  await expect(page.locator('#mark-video-seen')).toBeEnabled();
  await expect(page.locator('#video-progress-status')).toHaveText('Sin completar');
  await event(page,'playing',476);
  await page.clock.runFor(3000);await event(page,'timeupdate',479);
  await page.clock.runFor(1000);await event(page,'ended',480);
  release();
  await expect(page.locator('#video-progress-status')).toHaveText('✓ Completado');
  await page.reload();
  await expect(page.locator('#video-progress-status')).toHaveText('✓ Completado');
  await page.locator('[data-course-progress]').screenshot({path:info.outputPath('completion-footer.png')});
  const saved=await (await page.request.get('/api/v1/rewards/courses/1256/progress')).json();
  expect(saved.chapters[0].watched_seconds).toBe(480);
  expect(saved.chapters[0].manual_completed_at).toBeNull();
  expect(saved.chapters[0].playback_completed_at).toBeTruthy();
});
