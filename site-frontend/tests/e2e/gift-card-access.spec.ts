import { test, expect, type BrowserContext } from '@playwright/test';
async function fixture(context: BrowserContext, values: Record<string,string> = {}) {
  await context.addCookies(Object.entries({ carobra_session: 'e2e-eligible', 'home-level': 'GOLD', 'gift-identity': 'numeric', ...values }).map(([name,value]) => ({ name, value, domain: '127.0.0.1', path: '/' })));
}
test.beforeEach(async ({ context }) => {
  // Keep browser QA offline, including existing catalog images and map tiles.
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
test('member number on Home, Account and Bonda copies canonical value on repeated clicks', async ({ page, context }, testInfo) => {
  await fixture(context);
  await page.addInitScript(() => {
    (window as any).copies = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value: string) => { (window as any).copies.push(value); } }, configurable: true });
  });
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  for (const path of ['/cliente/recompensas','/cliente/perfil','/cliente/beneficios','/cliente/gift-cards']) {
    const response = await page.goto(path);
    if (path === '/cliente/beneficios') await page.screenshot({ path: testInfo.outputPath('benefits-gift-cards.png'), fullPage: true });
    expect(response?.headers()['cache-control']).toContain('no-store');
    await expect(page.locator('rewards-member-number strong')).toHaveText('123 456 789');
    const copy = page.getByRole('button', { name: 'Copiar Número de socio Rewards' });
    await copy.click(); await copy.click(); await copy.click();
    await expect(page.locator('rewards-member-number [role=status]')).toHaveText('Número de socio copiado sin espacios.');
    expect(await page.evaluate(() => (window as any).copies)).toEqual(['123456789','123456789','123456789']);
  }
  expect(writes).toEqual([]);
  await page.getByRole('link', { name: /Volver a Beneficios/ }).click();
  await expect(page).toHaveURL(/\/cliente\/beneficios#gift-cards$/);
  await expect(page.locator('#gift-cards')).toBeVisible();
  await page.getByRole('link', { name: /Ver mi avance/ }).click();
  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
});
test('clipboard rejection uses a local fallback; total failure exposes selectable canonical number', async ({ page, context }) => {
  await fixture(context);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('denied'); } }, configurable: true });
    document.execCommand = () => { (window as any).fallbackValue = (document.activeElement as HTMLInputElement)?.value; return !(window as any).failFallback; };
  });
  await page.goto('/cliente/perfil');
  await page.getByRole('button', { name: 'Copiar Número de socio Rewards' }).click();
  await expect(page.locator('rewards-member-number [role=status]')).toContainText('copiado sin espacios');
  expect(await page.evaluate(() => (window as any).fallbackValue)).toBe('123456789');
  await page.evaluate(() => { (window as any).failFallback = true; });
  await page.getByRole('button', { name: 'Copiar Número de socio Rewards' }).click();
  const input = page.getByRole('textbox', { name: 'Número de socio Rewards sin espacios' });
  await expect(input).toBeVisible(); await expect(input).toHaveValue('123456789'); await expect(input).toBeFocused();
  await expect(page.locator('rewards-member-number [role=status]')).toContainText('Selecciona y copia');
});
test('Gold visibility and canonical identity control the public link without external permissions', async ({ page, context }) => {
  const scenarios = [
    [{ 'home-level':'GOLD' }, 'level_met'], [{ 'home-level':'PLATINUM' }, 'level_met'], [{ 'home-level':'TITANIUM' }, 'level_met'],
    [{ 'home-level':'BRONZE' }, 'below_level'], [{ 'home-level':'SILVER' }, 'below_level'],
    [{ carobra_session:'e2e-pending' }, 'below_level'],
    [{ 'home-state':'BLOCKED' }, 'restricted'], [{ 'home-state':'INACTIVE' }, 'restricted'],
    [{ 'gift-identity':'missing' }, 'identity_pending'], [{ 'gift-identity':'legacy' }, 'identity_pending'], [{ 'gift-identity':'malformed' }, 'identity_pending'],
    [{ 'products-failure':'true' }, 'unavailable'],
  ] as const;
  for (const [cookies,state] of scenarios) {
    await context.clearCookies(); await fixture(context, cookies);
    await page.goto('/cliente/beneficios');
    const section = page.locator('#gift-cards');
    if (['below_level','restricted','unavailable'].includes(state)) {
      await expect(section).toHaveCount(0);
      await page.goto('/cliente/gift-cards');
      await expect(page.locator('#gift-cards')).toHaveCount(0);
      continue;
    }
    await expect(section).toHaveAttribute('data-state',state);
    if (state === 'level_met') {
      const link = section.getByRole('link', { name: /Ir a Bonda/ });
      await expect(link).toHaveAttribute('href', 'https://carobrarewards.bonda.com');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      // Observe navigation with an in-memory response; never contact the real microsite.
      const requests: string[] = [];
      await context.route('https://carobrarewards.bonda.com/', route => { requests.push(route.request().url()); return route.fulfill({ status:200, body:'Synthetic Bonda destination' }); });
      for (let i = 0; i < 2; i++) {
        const popupPromise = context.waitForEvent('page');
        await link.click();
        const popup = await popupPromise; await popup.waitForLoadState();
        await expect(popup).toHaveURL('https://carobrarewards.bonda.com/');
        await popup.close();
      }
      expect(requests).toEqual(['https://carobrarewards.bonda.com/','https://carobrarewards.bonda.com/']);
    } else {
      await expect(section.getByRole('button', { name: /Ir a Bonda/ })).toBeDisabled();
      await expect(section.locator('a[href^="http"]')).toHaveCount(0);
      await section.getByRole('button', { name: /Ir a Bonda/ }).evaluate((button: HTMLButtonElement) => { button.disabled = false; button.click(); button.click(); });
    }
    await expect(section).toContainText('3 puntos = $1 MXN');
    await expect(section).toContainText('catálogo completo');
    await expect(section).not.toContainText('Saldo disponible');
    await expect(page).toHaveURL(/\/cliente\/beneficios$/);
  }
});
test('mobile 320px, keyboard copy and unauthenticated navigation', async ({ page, context }, testInfo) => {
  await fixture(context); await page.setViewportSize({width:320,height:800});
  for (const path of ['/cliente/recompensas','/cliente/perfil','/cliente/beneficios','/cliente/gift-cards']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Copiar Número de socio Rewards' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('rewards-member-number [role=status]')).not.toBeEmpty();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('gift-cards-320.png'), fullPage: true });
  await context.clearCookies(); await page.goto('/cliente/beneficios'); await expect(page).toHaveURL(/\/login$/);
});
