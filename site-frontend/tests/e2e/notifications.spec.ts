import { expect, test, type BrowserContext } from '@playwright/test';

const readPath = '**/api/v1/rewards/portal/notifications/read';
const buttonName = 'Marcar todas como leídas';
async function cookies(context: BrowserContext, extra: Record<string, string> = {}) {
  await context.addCookies(Object.entries({
    carobra_session: 'e2e-eligible',
    'notifications-test': `${test.info().testId}-${test.info().project.name}`,
    ...extra,
  }).map(([name, value]) => ({ name, value, url: 'http://127.0.0.1:4322' })));
}

test('bulk action is top-right, persistent, keyboard usable and updates both counters', async ({ page, context }, info) => {
  await cookies(context);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') writes.push(request.postData() ?? ''); });
  await page.goto('/cliente/notificaciones');
  const bulk = page.getByRole('button', { name: buttonName });
  await expect(bulk).toBeEnabled();
  await expect(page.locator('#notifications-unread-count')).toHaveText('2 sin leer');
  expect(writes).toEqual([]);
  if (info.project.name === 'desktop-chromium') {
    const positions = await page.evaluate(() => ({ title: document.querySelector('h1')!.getBoundingClientRect().right, button: document.querySelector('#mark-all-read')!.getBoundingClientRect().left }));
    expect(positions.button).toBeGreaterThan(positions.title);
  }
  await page.screenshot({ path: info.outputPath('notifications.png'), fullPage: true });
  await bulk.focus();
  await expect(bulk).toBeFocused();
  await bulk.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Todas tus notificaciones están leídas.');
  await expect(page.locator('.notification-list li')).toHaveCount(2);
  await expect(page.locator('.notification-list .is-unread,.notification-list .mark-read')).toHaveCount(0);
  await expect(page.locator('[data-read-state]')).toHaveText(['Leída', 'Leída']);
  await expect(page.locator('#notifications-unread-count')).toHaveText('0 sin leer');
  await expect(page.locator('.client-shell__notification-count')).toHaveCount(0);
  await expect(page.locator('.client-shell__notification-link')).toHaveAttribute('aria-label', 'Ver notificaciones');
  await expect(bulk).toBeDisabled();
  expect(writes).toHaveLength(2);
  expect(new Set(writes).size).toBe(2);
  await page.reload();
  await expect(bulk).toBeDisabled();
  await expect(page.locator('#notifications-unread-count')).toHaveText('0 sin leer');
  await cookies(context, { carobra_session: 'e2e-pending' });
  await page.reload();
  await expect(page.locator('#notifications-unread-count')).toHaveText('1 sin leer');
});

test('individual reads update counters and bulk skips already-read rows', async ({ page, context }) => {
  await cookies(context);
  const requests: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') requests.push(request.postData() ?? ''); });
  await page.goto('/cliente/notificaciones');
  await page.locator('.mark-read').first().click();
  await expect(page.getByRole('status')).toHaveText('Notificación marcada como leída.');
  await expect(page.locator('#notifications-unread-count')).toHaveText('1 sin leer');
  await expect(page.locator('.client-shell__notification-count')).toHaveText('1');
  await expect(page.locator('.client-shell__notification-link')).toHaveAttribute('aria-label', 'Ver notificaciones, 1 sin leer');
  await page.getByRole('button', { name: buttonName }).click();
  await expect(page.getByRole('status')).toHaveText('Todas tus notificaciones están leídas.');
  expect(requests).toHaveLength(2);
  expect(new Set(requests).size).toBe(2);
});

test('pending state prevents duplicate writes and partial failure leaves only failed rows retryable', async ({ page, context }) => {
  await cookies(context);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let count = 0;
  await page.route(readPath, async route => {
    const fail = ++count === 1;
    await pending;
    if (fail) await route.fulfill({ status: 503, body: '{}' });
    else await route.continue();
  });
  await page.goto('/cliente/notificaciones');
  await page.getByRole('button', { name: buttonName }).click();
  await expect(page.getByRole('button', { name: 'Marcando…' })).toBeDisabled();
  await expect(page.locator('.mark-read').first()).toBeDisabled();
  await page.locator('#mark-all-read').evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => count).toBe(2);
  release();
  await expect(page.getByRole('status')).toContainText('Los pendientes siguen sin leer');
  await expect(page.locator('.notification-list .is-unread')).toHaveCount(1);
  await expect(page.locator('.notification-list .is-unread [data-read-state]')).toHaveText('Sin leer');
  await expect(page.locator('#notifications-unread-count')).toHaveText('1 sin leer');
  await expect(page.locator('.client-shell__notification-count')).toHaveText('1');
  await expect(page.getByRole('button', { name: buttonName })).toBeEnabled();
  await page.reload();
  await expect(page.locator('.notification-list .is-unread')).toHaveCount(1);
  await page.getByRole('button', { name: buttonName }).click();
  await expect(page.getByRole('status')).toHaveText('Todas tus notificaciones están leídas.');
  expect(count).toBe(3);
});

test('network and authentication failures do not change unread state', async ({ page, context }) => {
  await cookies(context);
  await page.route(readPath, route => route.abort());
  await page.goto('/cliente/notificaciones');
  await page.getByRole('button', { name: buttonName }).click();
  await expect(page.getByRole('status')).toContainText('No pudimos marcar todos los avisos');
  await expect(page.locator('#notifications-unread-count')).toHaveText('2 sin leer');
  await page.unroute(readPath);
  await page.route(readPath, route => route.fulfill({ status: 401, body: '{}' }));
  await page.getByRole('button', { name: buttonName }).click();
  await expect(page.getByRole('status')).toContainText('Tu sesión venció');
  await expect(page.locator('.notification-list .is-unread')).toHaveCount(2);
});

test('empty, already-read and unavailable inboxes disable bulk action', async ({ page, context }) => {
  for (const state of ['empty', 'read']) {
    await cookies(context, { 'notifications-state': state });
    await page.goto('/cliente/notificaciones');
    await expect(page.getByRole('button', { name: buttonName })).toBeDisabled();
    await expect(page.locator('#notifications-unread-count')).toHaveText('0 sin leer');
  }
  await cookies(context, { 'products-failure': 'true' });
  await page.reload();
  await expect(page.getByRole('button', { name: buttonName })).toBeDisabled();
});

test('bulk action and individual controls fit at 320px', async ({ page, context }, info) => {
  await cookies(context);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/cliente/notificaciones');
  await expect(page.getByRole('button', { name: buttonName })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('notifications-320.png'), fullPage: true });
  await page.getByRole('button', { name: buttonName }).click();
  await expect(page.getByRole('status')).toHaveText('Todas tus notificaciones están leídas.');
});

test('compact branded presentation preserves content with readable text and distinct read states', async ({ page, context }) => {
  await cookies(context);
  await page.goto('/cliente/notificaciones');
  await expect(page.locator('.notification-copy h3')).toHaveText(['Producto confirmado', 'Registro completado']);
  await expect(page.locator('.notification-copy p')).toHaveText(['Tu producto está activo en Carobra Rewards.', 'Tu cuenta Carobra Rewards quedó creada.']);
  await expect(page.locator('time').first()).toHaveAttribute('datetime', '2026-07-14T12:00:00.000Z');
  await expect(page.locator('[data-read-state]')).toHaveText(['Sin leer', 'Sin leer']);
  const styles = await page.locator('main').evaluate(main => {
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
      .map(n => { const c = n / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; })
      .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const ratio = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const background = (el: Element): string => {
      const value = getComputedStyle(el).backgroundColor;
      return value === 'rgba(0, 0, 0, 0)' && el.parentElement ? background(el.parentElement) : value;
    };
    const panel = getComputedStyle(main.querySelector('.notifications-panel')!);
    return {
      title: parseFloat(getComputedStyle(main.querySelector('h1')!).fontSize),
      subtitle: parseFloat(getComputedStyle(main.querySelector('h2')!).fontSize),
      background: panel.backgroundColor,
      image: panel.backgroundImage,
      contrast: [...main.querySelectorAll('h1,h2,h3,p,time,button,[data-read-state],#notifications-unread-count')].filter(el => el.textContent?.trim()).map(el => ({ text: el.textContent, ratio: ratio(getComputedStyle(el).color, background(el)) })),
    };
  });
  expect(styles.title).toBeLessThanOrEqual(38);
  expect(styles.subtitle).toBeLessThanOrEqual(20);
  expect(styles.background).toBe('rgb(255, 255, 255)');
  expect(styles.image).toBe('none');
  for (const item of styles.contrast) expect(item.ratio, item.text ?? '').toBeGreaterThanOrEqual(4.5);
  await page.locator('.mark-read').first().click();
  await expect(page.locator('[data-read-state]')).toHaveText(['Leída', 'Sin leer']);
  await expect(page.locator('.notification-copy h3')).toHaveText(['Producto confirmado', 'Registro completado']);
});
