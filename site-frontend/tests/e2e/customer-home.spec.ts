import {expect,test,type BrowserContext} from '@playwright/test';
const url='http://127.0.0.1:4322';
async function cookies(context:BrowserContext,values:Record<string,string>={}) {
  await context.addCookies(Object.entries({carobra_session:'e2e-eligible',...values}).map(([name,value])=>({name,value,url})));
}
test.beforeEach(async({page})=>{
  for(const host of ['i.vimeocdn.com','cuponstar-ar.s3.amazonaws.com']) await page.route(`https://${host}/**`,r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#cde8f5"/></svg>'}));
  await page.route('https://player.vimeo.com/**',r=>r.fulfill({contentType:'text/html',body:'<button>Play test video</button>'}));
});

test('home discovers real eligible modules and retains working destinations without writes',async({page,context},info)=>{
  await cookies(context);
  const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
  const response=await page.goto('/cliente/recompensas');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('heading',{name:'Bronce',exact:true})).toBeVisible();
  await expect(page.locator('.home-balance__amount')).toHaveText('150 pts');
  await expect(page.locator('.home-next-level')).toHaveCount(0);
  await expect(page.locator('.coupon-card')).toHaveCount(2);
  await expect(page.locator('.coupon-card__logo img')).toHaveCount(1);
  await expect(page.locator('.home-learning-card')).toHaveCount(3);
  await expect(page.getByRole('heading',{name:'Inteligencia Emocional'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Ver curso: Gestión Financiera Personal'})).toHaveAttribute('href','/cliente/cursos/1256');
  await expect(page.getByRole('link',{name:'Ver video: Rutina de relajación cervical'})).toHaveAttribute('href','/cliente/cursos/1500');
  await expect(page.getByRole('link',{name:/Leer artículo:/})).toHaveAttribute('href','/cliente/cursos/61');
  await expect(page.locator('.home-product')).toHaveCount(3);
  await expect(page.locator('.home-product__points')).toHaveText(['✦ +600 puntos Rewards','✦ +150 puntos Rewards','✦ +600 puntos Rewards']);
  await expect(page.locator('main')).not.toContainText(/Gift Cards|Sin contenido asignado|se habilitan|Fundamentos para tu retiro/);
  await expect(page.locator('.home-account')).not.toContainText(/%/);
  await expect(page.locator('.home-learning-grid')).not.toContainText(/%/);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('home.png'),fullPage:true});
  await page.getByRole('link',{name:'Descubrir Skandia',exact:true}).click();
  await expect(page).toHaveURL(/productos#producto-skandia$/);
  await expect(page.locator('#producto-skandia')).toBeInViewport();
  await page.goto('/cliente/recompensas');
  await page.getByRole('link',{name:/Leer artículo:/}).click();
  await expect(page.getByRole('article',{name:'Artículo de bienestar'})).toBeVisible();
});

test('saved manual and partial playback resume the pending chapter; finished courses do not continue',async({page,context,request})=>{
  const key=`home-${test.info().project.name}`;
  await cookies(context,{'progress-test':key});
  const save=async(chapter_id:number,ranges:number[][],manual:boolean)=>{
    const result=await request.post(`${url}/api/v1/rewards/courses/1256/progress`,{headers:{cookie:`carobra_session=e2e-eligible; progress-test=${key}`,origin:url,'x-carobra-action':'course-progress'},data:{chapter_id,ranges,manual}});
    expect(result.ok()).toBe(true);
  };
  await save(1256,[],true);
  await save(1257,[[30,60]],false);
  await page.goto('/cliente/recompensas');
  const continuation=page.getByRole('link',{name:'Continuar curso: Gestión Financiera Personal'});
  await expect(continuation).toHaveAttribute('href','/cliente/cursos/1256?capitulo=2');
  await expect(continuation).toContainText('1 de 3 capítulos completados');
  await continuation.click();
  await expect(page.locator('[data-chapter-panel="2"]')).toBeVisible();
  await save(1257,[],true);await save(1258,[],true);
  await page.goto('/cliente/recompensas');
  await expect(page.getByRole('link',{name:/Continuar curso:/})).toHaveCount(0);
  await expect(page.getByRole('link',{name:/Volver a ver:/})).toContainText('Completado');
});

test('Invitado and restricted states never advertise playable access',async({page,context})=>{
  await cookies(context,{carobra_session:'e2e-pending'});
  await page.goto('/cliente/recompensas');
  await expect(page.getByRole('heading',{name:'Invitado',exact:true})).toBeVisible();
  await expect(page.locator('.home-level').getByRole('link',{name:/Descubrir productos/})).toBeVisible();
  await expect(page.locator('.coupon-card,.home-learning-card')).toHaveCount(0);
  for(const state of ['BLOCKED','INACTIVE']) {
    await cookies(context,{'home-state':state});await page.reload();
    await expect(page.locator('.coupon-card,.home-learning-card')).toHaveCount(0);
    await expect(page.locator('.home-level').getByRole('link',{name:/Ir a Ayuda/})).toBeVisible();
    await expect(page.locator('.home-product')).toHaveCount(3);
  }
});

test('all five levels retain accurate identification; only approved progression and expiry appear',async({page,context})=>{
  for(const [level,label] of Object.entries({BRONZE:'Bronce',SILVER:'Plata',GOLD:'Oro',PLATINUM:'Platino',TITANIUM:'Titanio'})) {
    await cookies(context,{'home-level':level});await page.goto('/cliente/recompensas');
    await expect(page.locator('.home-level h2')).toHaveText(label);
    await expect(page.locator('.home-levels [aria-current]')).toContainText(label);
    await expect(page.locator('.home-next-level,.home-expiry')).toHaveCount(0);
  }
  await expect(page.locator('.home-level')).toContainText('Llegaste a lo más alto');
  await cookies(context,{'home-level':'BRONZE','home-rules':'true'});await page.reload();
  await expect(page.locator('.home-next-level')).toContainText('Tu camino a Plata');
  await expect(page.locator('.home-next-level')).toContainText('1 producto activo');
  await expect(page.locator('.home-next-level')).toContainText('2 meses de permanencia');
  await expect(page.locator('.home-next-level')).not.toContainText('actividades');
  await expect(page.locator('.home-expiry')).toBeVisible();
  await expect(page.locator('progress')).toHaveCount(0);
});

test('level accents are distinct, readable and identify the current step without color alone',async({page,context},info)=>{
  await cookies(context,{'home-level':'GOLD'});
  await page.goto('/cliente/recompensas');
  const current=page.locator('.home-levels [aria-current="step"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute('data-level','GOLD');
  await expect(current).toContainText('✓Oro');
  const contrast=await page.locator('.home-level').evaluate(panel=>{
    const rgb=(value:string):number[]=>value.startsWith('#')
      ? value.slice(1).match(/.{2}/g)!.map(v=>parseInt(v,16))
      : value.match(/[\d.]+/g)!.slice(0,3).map(Number);
    const luminance=(value:string)=>rgb(value).map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    const ratio=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const chips=[...panel.querySelectorAll('.home-levels li')].map(chip=>getComputedStyle(chip));
    const heading=getComputedStyle(panel.querySelector('h2')!).color;
    const active=getComputedStyle(panel.querySelector('[aria-current]')!);
    const style=getComputedStyle(panel);
    return {colors:chips.map(s=>s.color),chipRatios:chips.map(s=>ratio(s.color,s.backgroundColor)),
      titleRatios:['--carobra-navy','--carobra-blue'].map(token=>ratio(heading,style.getPropertyValue(token).trim())),
      heading,activeColor:active.color,border:active.borderTopColor,emblem:getComputedStyle(panel.querySelector('.home-level__emblem')!).color};
  });
  expect(new Set(contrast.colors).size).toBe(5);
  for(const ratio of [...contrast.chipRatios,...contrast.titleRatios])expect(ratio).toBeGreaterThanOrEqual(4.5);
  expect(contrast.heading).toBe(contrast.activeColor);
  expect(contrast.emblem).toBe(contrast.activeColor);
  expect(contrast.border).toBe(contrast.activeColor);
  await page.locator('.home-account').screenshot({path:info.outputPath('gold-level.png')});
  await page.setViewportSize({width:320,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('.home-levels li')).toHaveCount(5);
  expect(await page.locator('.home-levels').evaluate(list=>[...list.children].every(chip=>{
    const a=chip.getBoundingClientRect(),b=list.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right+1;
  }))).toBe(true);
  await page.locator('.home-account').screenshot({path:info.outputPath('gold-level-320.png')});
});

test('account failure leaves independently authorized catalogs and products usable',async({page,context})=>{
  await cookies(context,{'products-failure':'true'});await page.goto('/cliente/recompensas');
  await expect(page.getByRole('heading',{name:'No pudimos actualizar tu cuenta'})).toBeVisible();
  await expect(page.locator('.home-account')).toHaveCount(0);
  await expect(page.locator('.coupon-card')).toHaveCount(2);
  await expect(page.locator('.home-learning-card')).toHaveCount(3);
  await expect(page.locator('.home-product')).toHaveCount(3);
});

test('catalog errors, disabled and empty results stay distinct without hiding other modules',async({page,context})=>{
  await cookies(context,{'courses-failure':'true'});await page.goto('/cliente/recompensas');
  await expect(page.locator('.coupon-card')).toHaveCount(2);
  await expect(page.locator('.home-learning-grid')).toContainText('No pudimos cargar estos contenidos');
  await cookies(context,{'courses-failure':'false','home-coupons':'failure'});await page.reload();
  await expect(page.locator('.home-learning-card')).toHaveCount(3);
  await expect(page.getByText(/No pudimos cargar los beneficios/)).toBeVisible();
  await cookies(context,{'home-coupons':'disabled','home-learning':'disabled'});await page.reload();
  await expect(page.locator('.coupon-card,.home-learning-card')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('no está habilitado');
  await cookies(context,{'home-coupons':'empty','home-learning':'empty'});await page.reload();
  await expect(page.locator('main')).toContainText('no hay beneficios publicados');
  await expect(page.locator('main')).toContainText('No hay contenidos disponibles');
  await expect(page.locator('.home-product')).toHaveCount(3);
});

test('progress failure preserves discovery and states that progress is unavailable',async({page,context})=>{
  await cookies(context,{'home-progress':'unavailable'});await page.goto('/cliente/recompensas');
  await expect(page.locator('.home-inline-notice')).toContainText('Tu avance guardado no está disponible');
  await expect(page.getByRole('link',{name:/Continuar curso:/})).toHaveCount(0);
  await expect(page.getByRole('link',{name:/Ver curso:/})).toBeVisible();
});

test('bounded preview and 320px layout keep cards and controls usable',async({page,context},info)=>{
  await cookies(context,{'home-coupons':'many'});await page.setViewportSize({width:320,height:800});
  await page.goto('/cliente/recompensas');await expect(page.locator('.coupon-card')).toHaveCount(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.coupon-card').evaluateAll(cards=>cards.every(card=>card.querySelector('.coupon-card__logo')!.getBoundingClientRect().bottom < card.querySelector('.coupon-card__discount')!.getBoundingClientRect().top))).toBe(true);
  await page.screenshot({path:info.outputPath('home-320.png'),fullPage:true});
  await cookies(context,{'home-coupons':'slow'});
  await page.goto('/cliente/recompensas');
  await expect(page.getByText(/No pudimos cargar los beneficios/)).toBeVisible();
  await expect(page.locator('.home-learning-card')).toHaveCount(3);
});

test('anonymous access still redirects to login',async({page})=>{
  await page.goto('/cliente/recompensas');await expect(page).toHaveURL(/\/login/);
});
