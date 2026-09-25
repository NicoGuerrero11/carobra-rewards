import {expect, test} from '@playwright/test';

const facts = ['15 años de experiencia', 'Más de 2,000 asesores', 'Alianzas con instituciones líderes'];

test.beforeEach(async ({page}) => {
  await page.route('https://i.ytimg.com/**', route => route.abort());
  await page.route('https://i.vimeocdn.com/**', route => route.abort());
});

test('institutional facts use the confirmed age and replace the legacy cards without new requests', async ({page}) => {
  const apiRequests: string[] = [];
  page.on('request', req => { if (req.url().includes('/api/')) apiRequests.push(req.url()); });
  await page.goto('/#quienes-somos');
  const section = page.getByRole('region', {name: 'El respaldo detrás de Rewards.'});
  expect(await section.evaluate(el => el.previousElementSibling?.id)).toBe('experiencia');
  expect(await section.evaluate(el => el.nextElementSibling?.id)).toBe('confianza');
  await expect(section.locator('.about-carobra__intro')).toHaveText('Somos Carobra. Te acompañamos con soluciones para proteger lo que importa y construir tus próximos pasos.');
  await expect(section.locator('dt')).toHaveText(['Trayectoria', 'Red nacional', 'Respaldo']);
  await expect(section.locator('dd')).toHaveText(facts);
  await expect(section.locator('a')).toHaveCount(1);
  await expect(section.locator('button, img, iframe, video, script, a[href="/registro"]')).toHaveCount(0);
  await expect(page.locator('.public-about')).toHaveCount(0);
  await expect(section.getByText(/14 años/)).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test('navigation reveals the heading and the official-site link works by keyboard in a new tab', async ({page, context}) => {
  await page.setViewportSize({width: 1440, height: 1000});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await context.route('https://www.carobra.com/', route => route.fulfill({contentType: 'text/html', body: '<title>Carobra</title>'}));
  await page.goto('/');
  const anchor = page.getByRole('navigation', {name: 'Navegación principal'}).getByRole('link', {name: 'Quiénes somos', exact: true});
  await expect(anchor).toHaveAttribute('href', '#quienes-somos');
  await anchor.focus();
  await anchor.press('Enter');
  await expect(page).toHaveURL(/#quienes-somos$/);
  await expect.poll(async () => {
    const header = (await page.locator('.landing-header').boundingBox())!;
    const heading = (await page.locator('#about-carobra-title').boundingBox())!;
    return heading.y >= header.y + header.height && heading.y + heading.height < 1000;
  }).toBe(true);
  const link = page.locator('#quienes-somos').getByRole('link', {name: 'Conoce Carobra (abre en una pestaña nueva)', exact: true});
  await expect(link).toHaveAttribute('href', 'https://www.carobra.com/');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await link.focus();
  await expect(link).toBeFocused();
  expect(await link.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const popupPromise = page.waitForEvent('popup');
  await link.press('Enter');
  const popup = await popupPromise;
  await expect(popup).toHaveURL('https://www.carobra.com/');
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await popup.close();
});

test('institutional section remains complete without JavaScript', async ({browser}) => {
  const context = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 900}});
  await context.route('https://i.ytimg.com/**', route => route.abort());
  await context.route('https://i.vimeocdn.com/**', route => route.abort());
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/#quienes-somos');
  await expect(page.locator('#quienes-somos dd')).toHaveText(facts);
  await expect(page.locator('#about-carobra-title')).toBeInViewport();
  await expect(page.locator('#quienes-somos a')).toHaveAttribute('href', 'https://www.carobra.com/');
  await context.close();
});

for (const width of [320, 390, 768, 1440]) {
  test(`institutional facts reflow without clipping at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/#quienes-somos');
    await page.evaluate(() => document.fonts.ready);
    const section = page.locator('#quienes-somos');
    const list = section.locator('dl');
    expect(await list.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(width <= 700 ? 1 : 3);
    expect(await section.locator('header').evaluate(el => getComputedStyle(el).textAlign)).toBe('center');
    for (const el of await section.locator('h2, p, dt, dd, .about-carobra__value, a').all()) {
      const box = (await el.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(await el.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    const items = await list.locator(':scope > div').all();
    for (let i = 0; i < items.length; i++) {
      expect(await items[i].evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      if (i === 0) continue;
      const previous = (await items[i - 1].boundingBox())!;
      const current = (await items[i].boundingBox())!;
      if (width <= 700) {
        expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height - 1);
        expect(await items[i].evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('1px');
      } else {
        expect(current.y).toBe(previous.y);
        expect(current.x).toBeGreaterThanOrEqual(previous.x + previous.width - 1);
        expect(await items[i].evaluate(el => getComputedStyle(el).borderLeftWidth)).toBe('1px');
      }
    }
    if (width === 1440) expect((await section.boundingBox())!.height).toBeLessThan(460);
  });
}

test('200% text at 320px keeps the title facts and action readable', async ({page}) => {
  await page.setViewportSize({width: 320, height: 1000});
  await page.goto('/#quienes-somos');
  await page.addStyleTag({content: 'html {font-size: 200% !important}'});
  for (const el of await page.locator('#quienes-somos h2, #quienes-somos p, #quienes-somos dt, #quienes-somos dd, #quienes-somos .about-carobra__value, #quienes-somos a').all()) {
    expect(await el.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
});
