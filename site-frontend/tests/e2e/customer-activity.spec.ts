import { expect, test, type BrowserContext } from '@playwright/test';

async function cookies(context: BrowserContext, values: Record<string, string> = {}) {
  await context.addCookies(Object.entries({ carobra_session: 'e2e-eligible', ...values })
    .map(([name, value]) => ({ name, value, url: 'http://127.0.0.1:4322' })));
}

test('compact activity preserves all records and separate summaries without writes', async ({ page, context }, info) => {
  await cookies(context, { 'activity-fixture': 'review' });
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.goto('/cliente/activities');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Actividad');
  await expect(page.locator('.customer-activity__summary dd')).toHaveText(['150 pts', '6 en este historial', '2 en este historial']);
  await expect(page.locator('.customer-activity__timeline li')).toHaveCount(6);
  await expect(page.locator('.customer-activity__timeline h3')).toHaveText([
    'Producto confirmado', 'Producto confirmado', 'Producto confirmado', 'Producto confirmado', 'Producto confirmado', 'Registro completado',
  ]);
  await expect(page.locator('.customer-activity__timeline time').first()).toHaveAttribute('datetime', '2026-07-21T12:00:00.000Z');
  await expect(page.locator('.customer-activity__timeline p').first()).toHaveText('Tu producto está activo en Carobra Rewards.');
  await expect(page.locator('.customer-activity__movements h3')).toHaveText(['Primer producto validado', 'Bienvenida a Carobra Rewards']);
  await expect(page.locator('.customer-activity__amount strong')).toHaveText(['+105 pts', '+45 pts']);
  await expect(page.locator('.customer-activity__expiry')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/Tu historia, en orden|registros visibles|historial de este navegador/);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const positions = await page.evaluate(() => ({
    headerBottom: document.querySelector('.client-shell__topnav')!.getBoundingClientRect().bottom,
    titleTop: document.querySelector('h1')!.getBoundingClientRect().top,
    titleSize: parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize),
  }));
  expect(positions.titleTop).toBeGreaterThanOrEqual(positions.headerBottom);
  expect(positions.titleSize).toBeLessThanOrEqual(38);
  await page.screenshot({ path: info.outputPath('activity.png'), fullPage: true });
});

test('signed amounts, actual balance and approved expiration survive a 320px layout', async ({ page, context }, info) => {
  await cookies(context, { 'activity-fixture': 'mixed', 'activity-expiry': 'approved' });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/cliente/activities');
  await expect(page.locator('.customer-activity__balance dd')).toHaveText('950 pts');
  await expect(page.locator('.customer-activity__amount strong')).toHaveText(['+100 pts', '-50 pts', '+0 pts']);
  await expect(page.locator('.customer-activity__amount small')).toHaveText(['Abono', 'Cargo', 'Sin cambio']);
  await expect(page.locator('.customer-activity__expiry time')).toHaveAttribute('datetime', '2028-01-09T23:30:00.000Z');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.customer-activity__movements li').evaluateAll(rows => rows.every(row => {
    const title = row.children[0].getBoundingClientRect();
    const amount = row.children[1].getBoundingClientRect();
    return title.right <= amount.left && amount.right <= row.getBoundingClientRect().right + 1;
  }))).toBe(true);
  await page.screenshot({ path: info.outputPath('activity-320.png'), fullPage: true });
});

test('empty histories keep the real balance and an invited customer can still read activity', async ({ page, context }) => {
  await cookies(context, { 'activity-fixture': 'empty' });
  await page.goto('/cliente/activities');
  await expect(page.getByRole('heading', { name: 'Aún no hay eventos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sin movimientos' })).toBeVisible();
  await expect(page.locator('.customer-activity__summary dd')).toHaveText(['150 pts', '0 en este historial', '0 en este historial']);
  await cookies(context, { carobra_session: 'e2e-pending', 'activity-fixture': '' });
  await page.reload();
  await expect(page.locator('.customer-activity__summary dd')).toHaveText(['45 pts', '1 en este historial', '1 en este historial']);
  await expect(page.getByRole('heading', { name: 'Registro completado' })).toBeVisible();
});

test('unavailable data has a retry, not a fabricated zero balance', async ({ page, context }) => {
  await cookies(context, { 'products-failure': 'true' });
  await page.goto('/cliente/activities');
  await expect(page.getByRole('status')).toContainText('No pudimos cargar tu actividad');
  await expect(page.locator('.customer-activity__summary,.customer-activity__columns')).toHaveCount(0);
  const retry = page.getByRole('link', { name: 'Volver a intentar' });
  await expect(retry).toHaveAttribute('href', '/cliente/activities');
  await retry.focus();
  expect(await retry.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await cookies(context, { 'products-failure': 'false' });
  await retry.press('Enter');
  await expect(page.locator('.customer-activity__balance dd')).toHaveText('150 pts');
});

test('brand text remains readable on neutral surfaces', async ({ page, context }) => {
  await cookies(context, { 'activity-fixture': 'mixed', 'activity-expiry': 'approved' });
  await page.goto('/cliente/activities');
  const styles = await page.locator('main').evaluate(main => {
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
      .map(n => { const c = n / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; })
      .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const ratio = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const background = (el: Element): string => {
      const value = getComputedStyle(el).backgroundColor;
      return value === 'rgba(0, 0, 0, 0)' && el.parentElement ? background(el.parentElement) : value;
    };
    const text = [...main.querySelectorAll('h1,h2,h3,p,dt,dd,dd span,time,.customer-activity__amount strong,.customer-activity__amount small')];
    return {
      contrast: text.map(el => ({ text: el.textContent, ratio: ratio(getComputedStyle(el).color, background(el)) })),
      panels: [...main.querySelectorAll('.customer-activity__panel')].map(el => ({ color: getComputedStyle(el).backgroundColor, image: getComputedStyle(el).backgroundImage })),
    };
  });
  for (const item of styles.contrast) expect(item.ratio, item.text ?? '').toBeGreaterThanOrEqual(4.5);
  for (const panel of styles.panels) expect(panel).toEqual({ color: 'rgb(255, 255, 255)', image: 'none' });
});

test('anonymous activity access still redirects to login', async ({ page }) => {
  await page.goto('/cliente/activities');
  await expect(page).toHaveURL(/\/login/);
});
