import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';

const preferencesPath = '/api/v1/rewards/portal/preferences';
async function cookies(context: BrowserContext, extra: Record<string, string> = {}) {
  await context.addCookies(Object.entries({ carobra_session: 'e2e-eligible', 'account-test': randomUUID(), ...extra })
    .map(([name, value]) => ({ name, value, url: 'http://127.0.0.1:4322' })));
}

test('compact account uses real personal details and preferences without writes', async ({ page, context }, info) => {
  await cookies(context);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  const response = await page.goto('/cliente/perfil');
  expect(response?.headers()['cache-control']).toBe('private, no-store');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mi cuenta');
  await expect(page.getByRole('region', { name: 'Datos personales' })).toContainText('eligible@example.com');
  await expect(page.getByRole('switch')).toHaveCount(3);
  await expect(page.getByRole('switch', { name: 'Actividad de Rewards' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Cursos y contenidos' })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Actualizaciones de productos' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Guardar preferencias' })).toBeEnabled();
  await expect(page.getByText('Cuenta protegida', { exact: true })).toHaveCount(0);
  const geometry = await page.evaluate(() => ({
    titleSize: parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize),
    titleTop: document.querySelector('h1')!.getBoundingClientRect().top,
    navBottom: document.querySelector('.client-shell__topnav')!.getBoundingClientRect().bottom,
    headings: [...document.querySelectorAll('main h2')].map(el => parseFloat(getComputedStyle(el).fontSize)),
  }));
  expect(geometry.titleSize).toBeLessThanOrEqual(38);
  expect(geometry.titleTop).toBeGreaterThanOrEqual(geometry.navBottom);
  for (const size of geometry.headings) expect(size).toBeLessThanOrEqual(20);
  expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath('account.png'), fullPage: true });
});

test('explicit save sends only existing fields and persists selected values after reload', async ({ page, context }) => {
  await cookies(context);
  await page.goto('/cliente/perfil');
  await page.getByRole('switch', { name: 'Actividad de Rewards' }).uncheck();
  await page.getByRole('switch', { name: 'Cursos y contenidos' }).check();
  await page.getByRole('switch', { name: 'Actualizaciones de productos' }).uncheck();
  await expect(page.getByRole('status')).toHaveText('Tienes cambios sin guardar.');
  const saved = page.waitForRequest(request => request.url().endsWith(preferencesPath) && request.method() === 'PATCH');
  await page.getByRole('button', { name: 'Guardar preferencias' }).click();
  expect((await saved).postDataJSON()).toEqual({ activity_updates: false, learning_updates: true, product_updates: false });
  await expect(page.getByRole('status')).toHaveText('Preferencias guardadas.');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Actividad de Rewards' })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Cursos y contenidos' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Actualizaciones de productos' })).not.toBeChecked();
});

test('pending save disables controls, rejects duplicates and waits for acknowledgement', async ({ page, context }) => {
  await cookies(context);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  await page.route(`**${preferencesPath}`, async route => {
    writes++;
    await held;
    await route.continue();
  });
  await page.goto('/cliente/perfil');
  await page.getByRole('button', { name: 'Guardar preferencias' }).click();
  try {
    await expect(page.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled();
    for (const control of await page.getByRole('switch').all()) await expect(control).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('Guardando tus preferencias…');
    await page.locator('#preferences-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(writes).toBe(1);
  } finally { release(); }
  await expect(page.getByRole('status')).toHaveText('Preferencias guardadas.');
  await expect(page.getByRole('button', { name: 'Guardar preferencias' })).toBeEnabled();
});

for (const failure of ['service', 'network', 'timeout']) {
  test(`${failure} failure preserves choices and permits retry without false success`, async ({ page, context }) => {
    await cookies(context);
    if (failure === 'timeout') await page.addInitScript(() => {
      const original = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = ms => original(ms === 10000 ? 25 : ms);
    });
    await page.route(`**${preferencesPath}`, async route => {
      if (failure === 'network') return route.abort('failed');
      if (failure === 'timeout') await new Promise(resolve => setTimeout(resolve, 300));
      await route.fulfill({ status: failure === 'service' ? 503 : 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/cliente/perfil');
    const learning = page.getByRole('switch', { name: 'Cursos y contenidos' });
    await learning.check();
    await page.getByRole('button', { name: 'Guardar preferencias' }).click();
    await expect(page.getByRole('status')).toHaveText('No pudimos guardar tus preferencias. Intenta de nuevo.');
    await expect(learning).toBeChecked();
    await expect(learning).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Guardar preferencias' })).toBeEnabled();
    await page.unrouteAll({ behavior: 'wait' });
    // Restore the timeout before retrying through the isolated backend.
    if (failure === 'timeout') await page.evaluate(() => { AbortSignal.timeout = () => new AbortController().signal; });
    await page.getByRole('button', { name: 'Guardar preferencias' }).click();
    await expect(page.getByRole('status')).toHaveText('Preferencias guardadas.');
  });
}

test('keyboard switches have visible focus and submit without changing the contract', async ({ page, context }) => {
  await cookies(context);
  await page.goto('/cliente/perfil');
  const activity = page.getByRole('switch', { name: 'Actividad de Rewards' });
  await activity.focus();
  await activity.press('Space');
  await expect(activity).not.toBeChecked();
  expect(await activity.evaluate(el => getComputedStyle(el.nextElementSibling!).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('switch', { name: 'Cursos y contenidos' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('switch', { name: 'Actualizaciones de productos' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Guardar preferencias' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Preferencias guardadas.');
});

test('unavailable preferences do not invent settings while identity and help remain usable', async ({ page, context }, info) => {
  await cookies(context, { 'products-failure': 'true' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/cliente/perfil');
  await expect(page.getByRole('status')).toContainText('No pudimos cargar tus preferencias');
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar preferencias' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Datos personales' })).toContainText('eligible@example.com');
  await expect(page.getByRole('link', { name: 'Volver a intentar' })).toHaveAttribute('href', '/cliente/perfil');
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('account-unavailable.png'), fullPage: true });
  await page.getByRole('link', { name: 'Ir al Centro de ayuda' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿En qué podemos ayudarte?');
});

test('account help routes to truthful support information instead of an unconfirmed email', async ({ page, context }) => {
  await cookies(context);
  await page.goto('/cliente/perfil');
  await expect(page.locator('main a[href^="mailto:"]')).toHaveCount(0);
  for (const name of ['Ayuda con mis datos', 'Ayuda con mi acceso']) {
    await expect(page.getByRole('link', { name })).toHaveAttribute('href', '/cliente/ayuda#soporte');
  }
  await page.getByRole('link', { name: 'Ayuda con mis datos' }).click();
  await expect(page).toHaveURL(/\/cliente\/ayuda#soporte$/);
  await expect(page.getByRole('region', { name: 'Soporte Rewards', exact: true })).toContainText('no es un canal de atención habilitado');
});

test('long identity and preferences remain readable at 320px with branded contrast', async ({ page, context }, info) => {
  await cookies(context, { 'account-identity': 'long' });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/cliente/perfil');
  await expect(page.locator('.customer-account__details')).toContainText('Guerrero Fernández de la Concepción');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const ratios = await page.locator('main').evaluate(main => {
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
      .map(n => { const c = n / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; })
      .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const background = (el: Element): string => {
      const color = getComputedStyle(el).backgroundColor;
      return color === 'rgba(0, 0, 0, 0)' && el.parentElement ? background(el.parentElement) : color;
    };
    return [...main.querySelectorAll('h1,h2,p,strong,small,a,dt,dd,button')].filter(el => el.getBoundingClientRect().height && el.textContent?.trim()).map(el => {
      const a = luminance(getComputedStyle(el).color), b = luminance(background(el));
      return { text: el.textContent, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
  for (const item of ratios) expect(item.ratio, item.text ?? '').toBeGreaterThanOrEqual(4.5);
  for (const control of await page.locator('.customer-account__switch').all()) {
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: info.outputPath('account-320.png'), fullPage: true });
});

test('without JavaScript settings are read-only and do not accidentally submit a GET form', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await cookies(context);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/cliente/perfil');
  // Playwright's text selectors intentionally skip noscript content.
  await expect(page.locator('noscript .customer-account__notice')).toBeVisible();
  await expect(page.locator('noscript .customer-account__notice')).toHaveText('Activa JavaScript en tu navegador para cambiar tus preferencias.');
  await expect(page.getByRole('button', { name: 'Guardar preferencias' })).toBeDisabled();
  for (const control of await page.getByRole('switch').all()) await expect(control).toBeDisabled();
  await page.getByRole('link', { name: 'Ir al Centro de ayuda' }).click();
  await expect(page).toHaveURL(/\/cliente\/ayuda$/);
  await context.close();
});

test('anonymous visitors cannot view the account page', async ({ page }) => {
  await page.goto('/cliente/perfil');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('.customer-account__details')).toHaveCount(0);
});
