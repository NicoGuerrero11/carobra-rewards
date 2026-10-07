import { test, expect } from '@playwright/test';
test.beforeEach(async ({context}) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addCookies([{name:'carobra_session',value:'e2e-eligible'},{name:'home-level',value:'GOLD'},{name:'gift-identity',value:'numeric'}].map(x=>({...x,domain:'127.0.0.1',path:'/'})));
});
test('Bonda is the balance authority across Home, Activity and gift cards; unknown never becomes zero', async ({page,context},testInfo) => {
  for (const mode of ['fresh','zero','stale','unavailable','disabled']) {
    await context.addCookies([{name:'bonda-balance',value:mode,domain:'127.0.0.1',path:'/'}]);
    for (const path of ['/cliente/recompensas','/cliente/activities','/cliente/beneficios']) {
      await page.goto(path);
      const balance=page.getByLabel('Puntos para gift cards en Bonda',{exact:true});
      await expect(balance.locator('.bonda-balance__amount')).toHaveText(`${mode==='zero'?'0':['fresh','stale'].includes(mode)?'900':'—'} pts`);
      if(mode==='stale')await expect(balance).toContainText('Puede haber cambiado');
      if(mode==='disabled')await expect(balance).toContainText('en preparación');
      if(mode==='unavailable')await expect(balance).toContainText('No pudimos consultar');
      if(mode!=='disabled'){await expect(balance).toContainText('300 puntos pendientes');await expect(balance).toContainText('150 puntos en revisión');}
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
      if(mode==='fresh'&&path==='/cliente/recompensas')await page.screenshot({path:testInfo.outputPath('bonda-points-home.png'),fullPage:true});
    }
  }
});
test('downgrade hides gift access while balance remains separate from level and local earnings',async({page,context})=>{
  await context.addCookies([{name:'bonda-balance',value:'zero'},{name:'home-level',value:'SILVER'}].map(x=>({...x,domain:'127.0.0.1',path:'/'})));
  await page.goto('/cliente/recompensas');await expect(page.getByLabel('Puntos para gift cards en Bonda',{exact:true})).toContainText('0 pts');await expect(page.locator('.home-level h2')).toHaveText('Plata');
  await page.goto('/cliente/beneficios');await expect(page.locator('#gift-cards')).toHaveCount(0);
});
