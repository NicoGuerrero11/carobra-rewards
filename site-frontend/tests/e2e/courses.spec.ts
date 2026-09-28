import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('https://player.vimeo.com/**',r=>r.fulfill({contentType:'text/html',body:'<button>Play test video</button>'}));
  await page.route('https://i.vimeocdn.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#dff5fc"/></svg>'}));
  await page.route('https://cuponstar-ar.s3.amazonaws.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#dff5fc"/></svg>'}));
});

test('eligible customer filters courses and switches ordered chapters with one player',async({page,context},info)=>{
  await context.addCookies([{name:'carobra_session',value:'e2e-eligible',url:'http://127.0.0.1:4322'}]);
  await page.goto('/cliente/cursos');
  await expect(page.getByRole('heading',{name:'Cursos y bienestar',exact:true})).toBeVisible();
  await expect(page.locator('.learning-space')).toHaveCount(2);
  await expect(page.locator('[data-course-card]')).toHaveCount(0);
  await expect.poll(()=>page.locator('.learning-space img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('learning-entry.png'),fullPage:true});
  await page.getByRole('link',{name:'Explorar cursos'}).click();
  await expect(page).toHaveURL(/tipo=cursos$/);
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.locator('[data-course-card][data-category="Bienestar"]')).toHaveCount(1);
  await expect(page.getByRole('heading',{name:'Rutina de relajación cervical'})).toHaveCount(0);
  await expect(page.locator('[data-course-card]:visible')).toHaveCount(1);
  await page.getByLabel('Acceso',{exact:true}).selectOption('all');
  await expect(page.locator('[data-course-card]:visible')).toHaveCount(3);
  await expect(page.getByText('Desde Oro')).toBeVisible();
  await page.getByLabel('Categoría',{exact:true}).selectOption('Inglés');
  await expect(page.locator('[data-course-card]:visible')).toHaveCount(1);
  await expect(page.getByText('Desde Plata')).toBeVisible();
  await page.getByLabel('Acceso',{exact:true}).selectOption('available');
  await expect(page.locator('#course-empty')).toBeVisible();
  await page.getByLabel('Categoría',{exact:true}).selectOption('');
  await expect(page.locator('[data-course-card]:visible')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('courses-catalog.png'),fullPage:true});
  await page.getByRole('link',{name:'Ver curso: Gestión Financiera Personal',exact:true}).click();
  await expect(page.locator('#course-player')).toHaveAttribute('src',/123451/);
  await page.locator('[data-chapter="2"]').click();
  await expect(page.locator('#course-player')).toHaveAttribute('src',/123452/);
  await expect(page.locator('[data-chapter-panel="2"]')).toBeVisible();
  await expect(page.locator('[data-chapter-panel="1"]')).toBeHidden();
  await expect(page.locator('[data-chapter="2"]')).toHaveAttribute('aria-current','true');
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('courses-viewer.png'),fullPage:true});
  await page.getByRole('link',{name:'← Volver a cursos',exact:true}).click();
  await expect(page).toHaveURL(/tipo=cursos$/);
});

test('invited preview never exposes playback and direct URL stays locked',async({page,context})=>{
  await context.addCookies([{name:'carobra_session',value:'e2e-pending',url:'http://127.0.0.1:4322'}]);
  await page.goto('/cliente/cursos');
  await page.getByRole('link',{name:'Explorar cursos'}).click();
  await expect(page.getByText('Invitado',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:/Ver curso:/})).toHaveCount(0);
  expect(await page.content()).not.toContain('player.vimeo.com');
  const response=await page.goto('/cliente/cursos/1256');
  expect(response?.status()).toBe(403);
  await expect(page.getByRole('heading',{name:'Este curso aún no está disponible para tu cuenta'})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('wellbeing stays separate and preserves its return destination',async({page,context},info)=>{
  await context.addCookies([{name:'carobra_session',value:'e2e-eligible',url:'http://127.0.0.1:4322'}]);
  await page.goto('/cliente/cursos');
  await page.getByRole('link',{name:'Explorar bienestar'}).click();
  await expect(page.getByRole('heading',{name:'Bienestar para ti'})).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.locator('[data-course-card]:visible')).toHaveCount(2);
  await expect(page.getByRole('heading',{name:'Inteligencia Emocional'})).toHaveCount(0);
  await expect(page.locator('#course-category option')).toHaveCount(3);
  await expect(page.getByText('Todo este catálogo está disponible desde Bronce.',{exact:false})).toBeVisible();
  await expect(page.getByText('Cada nuevo nivel suma contenidos',{exact:false})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('wellbeing-catalog.png'),fullPage:true});
  await page.getByRole('link',{name:'Ver video: Rutina de relajación cervical',exact:true}).click();
  await page.getByRole('link',{name:'← Volver a bienestar'}).click();
  await expect(page).toHaveURL(/tipo=bienestar$/);
  await context.addCookies([{name:'carobra_session',value:'e2e-pending',url:'http://127.0.0.1:4322'}]);
  await page.reload();
  await expect(page.locator('[data-course-card]').getByText('Desde Bronce',{exact:true})).toHaveCount(2);
  await expect(page.locator('iframe')).toHaveCount(0);
  const denied=await page.goto('/cliente/cursos/1500');
  expect(denied?.status()).toBe(403);
  await page.goto('/cliente/cursos?tipo=unknown');
  await expect(page).toHaveURL(/\/cliente\/cursos$/);
});

test('Gold thematic course stays in Cursos and returns there, while Bronze cannot open it',async({page,context})=>{
  await context.addCookies([{name:'carobra_session',value:'e2e-eligible',url:'http://127.0.0.1:4322'}]);
  const denied=await page.goto('/cliente/cursos/273');expect(denied?.status()).toBe(403);
  await context.addCookies([{name:'courses-level',value:'GOLD',url:'http://127.0.0.1:4322'}]);
  await page.goto('/cliente/cursos?tipo=cursos');
  await page.getByLabel('Categoría',{exact:true}).selectOption('Bienestar');
  await expect(page.locator('[data-course-card]:visible')).toHaveCount(1);
  await page.getByRole('link',{name:'Ver curso: Inteligencia Emocional',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Inteligencia Emocional',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'← Volver a bienestar'})).toHaveCount(0);
  await page.getByRole('link',{name:'← Volver a cursos',exact:true}).click();
  await expect(page).toHaveURL(/tipo=cursos$/);
});

test('Bronze reads wellness articles without playback or completion, invited direct URLs are denied',async({page,context},info)=>{
  await context.addCookies([{name:'carobra_session',value:'e2e-eligible',url:'http://127.0.0.1:4322'}]);
  const writes:string[]=[];page.on('request',r=>{if(r.method()==='POST' && r.url().includes('/progress'))writes.push(r.url());});
  await page.goto('/cliente/cursos?tipo=bienestar');
  const card=page.locator('[data-course-card]').filter({hasText:'7 ejercicios para realizar con pelota medicinal'});
  await expect(card.getByText('Artículo',{exact:true})).toBeVisible();
  await expect(card.locator('.course-progress-count')).toHaveCount(0);
  await card.getByRole('link',{name:/Leer artículo:/}).click();
  await expect(page.getByRole('article',{name:'Artículo de bienestar'})).toBeVisible();
  await expect(page.getByText('Primera recomendación.')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('[data-course-progress]')).toHaveCount(0);
  await expect(page.getByText('Duración no informada',{exact:false})).toHaveCount(0);
  await expect(page.locator('.article-body script')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(writes).toEqual([]);
  await page.screenshot({path:info.outputPath('wellness-article.png'),fullPage:true});
  await page.getByRole('link',{name:'← Volver a bienestar'}).click();
  await expect(page).toHaveURL(/tipo=bienestar$/);
  await context.addCookies([{name:'carobra_session',value:'e2e-pending',url:'http://127.0.0.1:4322'}]);
  const denied=await page.goto('/cliente/cursos/61');expect(denied?.status()).toBe(403);
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByText('Primera recomendación.')).toHaveCount(0);
});

test('failures offer retry without presenting an empty catalog and anonymous detail requires login',async({page,context})=>{
  await page.goto('/cliente/cursos/1256');
  await expect(page).toHaveURL(/\/login$/);
  await context.addCookies([{name:'carobra_session',value:'e2e-eligible',url:'http://127.0.0.1:4322'},{name:'courses-failure',value:'true',url:'http://127.0.0.1:4322'}]);
  await page.goto('/cliente/cursos');
  await expect(page.getByRole('heading',{name:'No pudimos cargar tus cursos'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Volver a intentar →'})).toBeVisible();
  await page.goto('/cliente/cursos/1256');
  await expect(page.getByRole('heading',{name:'No pudimos abrir este curso'})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});
