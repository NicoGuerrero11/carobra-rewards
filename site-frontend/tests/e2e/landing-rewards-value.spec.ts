import {expect, test} from '@playwright/test';

const levels = ['Bronce', 'Plata', 'Oro', 'Platino', 'Titanio'];
test.beforeEach(async ({page}) => {
  await page.route('https://i.ytimg.com/**', route => route.abort());
  await page.route('https://i.vimeocdn.com/**', route => route.abort());
});

test('value section replaces old cards with truthful levels and one registration action', async ({page}) => {
  const apiRequests: string[] = [];
  page.on('request', req => { if (req.url().includes('/api/')) apiRequests.push(req.url()); });
  await page.goto('/#beneficios');
  const section = page.getByRole('region', {name: 'Tu confianza te lleva más lejos.'});
  await expect(section).toHaveAttribute('id', 'beneficios');
  expect(await section.evaluate(el => el.previousElementSibling?.id)).toBe('aprendizaje');
  expect(await section.evaluate(el => el.nextElementSibling?.id)).toBe('experiencia');
  await expect(section.getByRole('list', {name: 'Niveles del programa'}).getByRole('listitem')).toHaveText(levels);
  for (const title of ['Tu relación cuenta.', 'Más posibilidades según tu nivel.', 'Tu progreso, a la vista.']) {
    await expect(section.getByRole('heading', {name: title, exact: true})).toBeVisible();
  }
  await expect(section.locator('a')).toHaveCount(1);
  await expect(section.getByRole('link', {name: 'Quiero ser parte'})).toHaveAttribute('href', '/registro');
  await expect(section.locator('img, iframe, video, button, [role="progressbar"], [aria-current], [aria-selected]')).toHaveCount(0);
  await expect(page.locator('.capabilities-grid, .capability-visual, .split-stats')).toHaveCount(0);
  for (const icon of await section.locator('svg').all()) {
    expect(await icon.evaluate(el => !!el.closest('[aria-hidden="true"]'))).toBe(true);
  }
  await expect(section).not.toContainText(/\d+\s*(?:pts|puntos)|tu nivel actual|completado/i);
  expect(apiRequests).toEqual([]);
});

test('single action has visible keyboard focus and reaches registration', async ({page}) => {
  await page.goto('/#beneficios');
  const cta = page.locator('#beneficios').getByRole('link', {name: 'Quiero ser parte'});
  await cta.focus();
  await expect(cta).toBeFocused();
  expect(await cta.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await cta.press('Enter');
  await expect(page).toHaveURL(/\/registro$/);
});

test('content and registration remain available without JavaScript', async ({browser}) => {
  const context = await browser.newContext({javaScriptEnabled: false});
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/#beneficios');
  const section = page.locator('#beneficios');
  await expect(section.locator('.rewards-value__level-name')).toHaveText(levels);
  await expect(section.locator('.rewards-value__messages li')).toHaveCount(3);
  await section.getByRole('link', {name: 'Quiero ser parte'}).click();
  await expect(page).toHaveURL(/\/registro$/);
  await context.close();
});

for (const width of [320, 390, 768, 1440]) {
  test(`value layout is centered and readable at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/#beneficios');
    await page.evaluate(() => document.fonts.ready);
    const section = page.locator('#beneficios');
    const layout = section.locator('.rewards-value__layout');
    expect(await layout.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(width > 900 ? 2 : 1);
    expect(await section.locator('header').evaluate(el => getComputedStyle(el).textAlign)).toBe('center');
    const sectionBox = (await section.boundingBox())!;
    for (const el of await section.locator('h2, h3, p, li, a').all()) {
      const box = (await el.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(sectionBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(sectionBox.x + sectionBox.width + 1);
      expect(await el.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    if (width === 1440) expect(sectionBox.height).toBeLessThan(650);
    if (width <= 480) {
      const names = await section.locator('.rewards-value__level-name').all();
      for (let i = 1; i < names.length; i++) {
        const previous = (await names[i - 1].boundingBox())!;
        const current = (await names[i].boundingBox())!;
        expect(current.y).toBeGreaterThan(previous.y + previous.height);
      }
    }
  });
}

test('enlarged text on narrow screens remains readable without horizontal clipping', async ({page}) => {
  await page.setViewportSize({width: 320, height: 1000});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/#beneficios');
  await page.addStyleTag({content: 'html { font-size: 200% !important; }'});
  for (const el of await page.locator('#beneficios h2, #beneficios h3, #beneficios p, #beneficios li, #beneficios a').all()) {
    expect(await el.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
});
