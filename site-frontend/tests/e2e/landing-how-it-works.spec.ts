import {expect, test} from '@playwright/test';

const titles = ['Crea tu cuenta', 'Confirmamos tus productos', 'Descubre lo que tienes disponible'];
const descriptions = [
  'Regístrate y comienza tu experiencia en Carobra Rewards.',
  'Validamos tu relación con Carobra para asignarte el nivel correspondiente.',
  'Consulta tus puntos y explora los beneficios, cursos y bienestar de tu cuenta.',
];

test.beforeEach(async ({page}) => {
  await page.route('https://i.ytimg.com/**', route => route.abort());
  await page.route('https://i.vimeocdn.com/**', route => route.abort());
});

test('three concise ordered steps replace the old cards without adding actions or requests', async ({page}) => {
  const apiRequests: string[] = [];
  page.on('request', req => { if (req.url().includes('/api/')) apiRequests.push(req.url()); });
  await page.goto('/#experiencia');
  const section = page.getByRole('region', {name: 'Empieza en tres pasos.'});
  expect(await section.evaluate(el => el.previousElementSibling?.id)).toBe('beneficios');
  expect(await section.evaluate(el => el.nextElementSibling?.id)).toBe('quienes-somos');
  const list = section.getByRole('list', {name: 'Pasos para comenzar en Rewards'});
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.locator('h3')).toHaveText(titles);
  await expect(list.locator('p')).toHaveText(descriptions);
  await expect(list.locator('.how-it-works__number')).toHaveText(['01', '02', '03']);
  for (const number of await list.locator('.how-it-works__number').all()) {
    await expect(number).toHaveAttribute('aria-hidden', 'true');
  }
  await expect(section.locator('a, button, blockquote, img, iframe, video, [role="progressbar"]')).toHaveCount(0);
  await expect(page.locator('.experience-intro, .experience-timeline, .experience-step')).toHaveCount(0);
  expect(await section.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(apiRequests).toEqual([]);
});

test('menu and hero anchors reveal the heading below the sticky header', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/');
  for (const link of [
    page.getByRole('navigation', {name: 'Navegación principal'}).getByRole('link', {name: 'Cómo funciona', exact: true}),
    page.locator('.landing-hero').getByRole('link', {name: 'Descubre cómo funciona'}),
  ]) {
    await expect(link).toHaveAttribute('href', '#experiencia');
    await link.focus();
    await link.press('Enter');
    await expect(page).toHaveURL(/#experiencia$/);
    await expect.poll(async () => {
      const header = (await page.locator('.landing-header').boundingBox())!;
      const heading = (await page.locator('#how-it-works-title').boundingBox())!;
      return heading.y >= header.y + header.height && heading.y + heading.height < 1000;
    }).toBe(true);
  }
});

test('steps remain complete without JavaScript', async ({browser}) => {
  const context = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 900}});
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/#experiencia');
  await expect(page.locator('#experiencia h3')).toHaveText(titles);
  await expect(page.locator('#experiencia li p')).toHaveText(descriptions);
  await expect(page.locator('#how-it-works-title')).toBeInViewport();
  await context.close();
});

for (const width of [320, 390, 768, 1440]) {
  test(`steps reflow in order without clipping at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/#experiencia');
    await page.evaluate(() => document.fonts.ready);
    const section = page.locator('#experiencia');
    const list = section.locator('ol');
    expect(await list.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(width <= 700 ? 1 : 3);
    expect(await section.locator('header').evaluate(el => getComputedStyle(el).textAlign)).toBe('center');
    for (const el of await section.locator('li, h2, h3, p').all()) {
      const box = (await el.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(await el.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    const items = await list.locator('li').all();
    for (let i = 1; i < items.length; i++) {
      const previous = (await items[i - 1].boundingBox())!;
      const current = (await items[i].boundingBox())!;
      if (width <= 700) expect(current.y).toBeGreaterThan(previous.y + previous.height);
      else {
        expect(current.y).toBe(previous.y);
        expect(current.x).toBeGreaterThan(previous.x + previous.width);
      }
    }
    if (width === 1440) expect((await section.boundingBox())!.height).toBeLessThan(460);
  });
}

test('200% text on a narrow screen preserves readable step content', async ({page}) => {
  await page.setViewportSize({width: 320, height: 1000});
  await page.goto('/#experiencia');
  await page.addStyleTag({content: 'html {font-size: 200% !important}'});
  for (const el of await page.locator('#experiencia li, #experiencia h2, #experiencia h3, #experiencia p').all()) {
    expect(await el.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
});
