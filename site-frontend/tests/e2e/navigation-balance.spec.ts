import {test, expect} from '@playwright/test';

test.beforeEach(async ({context}) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addCookies([{name:'carobra_session',value:'e2e-eligible'},{name:'home-level',value:'GOLD'},{name:'gift-identity',value:'numeric'},{name:'bonda-balance',value:'unavailable'}].map(cookie=>({...cookie,domain:'127.0.0.1',path:'/'})));
});

test('a pending balance never blocks navigation and a confirmed zero remains distinct from unknown', async ({page}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  await page.route('**/api/v1/rewards/bonda-balance', async route => {
    await gate;
    await route.fulfill({json:{status:'FRESH',available:'0',observed_at:new Date().toISOString(),pending:null,verification_required:null}});
  });
  await page.goto('/cliente/activities');
  const balance=page.getByLabel('Puntos para gift cards',{exact:true});
  await expect(page.getByRole('heading',{name:'Actividad',exact:true})).toBeVisible();
  await expect(balance.locator('.bonda-balance__amount')).toBeHidden();
  release();
  await expect(balance.locator('.bonda-balance__amount')).toHaveText('0 pts');
  await expect(balance).toHaveAttribute('data-bonda-status','FRESH');
  // The dev-only Astro toolbar overlays the mobile bottom navigation in CI.
  // Remove that tooling overlay; still exercise a real, unforced user click.
  await page.addStyleTag({content:'astro-dev-toolbar { display: none !important; }'});
  await page.getByRole('link',{name:'Productos',exact:true}).first().click();
  await expect(page).toHaveURL(/\/cliente\/productos$/);
});

test('failed refresh retains an explicitly stale observation and retry can recover', async ({page,context}) => {
  await context.addCookies([{name:'bonda-balance',value:'stale',domain:'127.0.0.1',path:'/'}]);
  let fails=true;
  await page.route('**/api/v1/rewards/bonda-balance', route => fails ? route.fulfill({status:503,json:{error:{code:'unavailable'}}}) : route.fulfill({json:{status:'FRESH',available:'800',observed_at:new Date().toISOString(),pending:null,verification_required:null}}));
  await page.goto('/cliente/activities');
  const balance=page.getByLabel('Puntos para gift cards',{exact:true});
  await expect(balance).toContainText('Puede haber cambiado');
  await expect(balance.locator('.bonda-balance__amount')).toHaveText('900 pts');
  const retry=balance.getByRole('button',{name:'Actualizar saldo'});
  await expect(retry).toBeEnabled();
  fails=false; await retry.click();
  await expect(balance).toHaveAttribute('data-bonda-status','FRESH');
  await expect(balance.locator('.bonda-balance__amount')).toHaveText('800 pts');
});

test('expired balance session redirects to login', async ({page}) => {
  await page.route('**/api/v1/rewards/bonda-balance', route => route.fulfill({status:401,json:{error:{code:'unauthenticated'}}}));
  await page.route('**/login?error=unauthenticated', route => route.fulfill({body:'Session expired',contentType:'text/html'}));
  await page.goto('/cliente/activities');
  await expect(page).toHaveURL(/\/login\?error=unauthenticated$/);
});
