import {expect, test} from '@playwright/test';

const cover = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#d3e6f1"/></svg>';
test.beforeEach(async ({page}) => {
  await page.route('https://i.ytimg.com/**', route => route.abort());
  await page.route('https://i.vimeocdn.com/**', route => route.fulfill({contentType: 'image/svg+xml', body: cover}));
});

test('learning is an independent truthful preview with no public playback or API calls', async ({page}) => {
  const prohibited: string[] = [];
  page.on('request', req => {
    if (/\/api\/|player\.vimeo|cuponstar|youtube(?:-nocookie)?\.com\/embed/.test(req.url())) prohibited.push(req.url());
  });
  await page.goto('/#aprendizaje');
  const section = page.locator('#aprendizaje');
  expect(await section.evaluate(el => el.previousElementSibling?.id)).toBe('catalogo');
  await expect(section.getByRole('tab', {name: 'Cursos', exact: true})).toHaveAttribute('aria-selected', 'true');
  const courses = section.getByRole('tabpanel', {name: 'Cursos', exact: true});
  await expect(courses.getByRole('listitem')).toHaveCount(6);
  await expect(courses.getByRole('heading', {name: 'Gestión Financiera Personal'})).toBeVisible();
  await expect(courses.locator('[data-level="GOLD"]')).toHaveText('Desde Oro');
  await expect(section.getByRole('link', {name: 'Únete a Rewards'})).toHaveAttribute('href', '/registro');
  await expect(section.getByText('Cursos según tu nivel. Bienestar desde Bronce. Acceso con cuenta activa.')).toBeVisible();
  await expect(section.locator('iframe, video')).toHaveCount(0);
  await expect(section.locator('li a, li button')).toHaveCount(0);
  for (const img of await section.locator('img').all()) {
    await expect(img).toHaveAttribute('loading', 'lazy');
    await expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  }
  expect(prohibited).toEqual([]);
});

test('tabs separate wellness from courses, preserve levels and support keyboard selection', async ({page}) => {
  await page.goto('/#aprendizaje');
  const section = page.locator('#aprendizaje');
  const courses = section.getByRole('tab', {name: 'Cursos', exact: true});
  const wellness = section.getByRole('tab', {name: 'Bienestar', exact: true});
  await courses.focus();
  await courses.press('ArrowRight');
  await expect(wellness).toBeFocused();
  await expect(wellness).toHaveAttribute('aria-selected', 'true');
  expect(await wellness.evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
  await expect(courses).toHaveAttribute('tabindex', '-1');
  const panel = section.getByRole('tabpanel', {name: 'Bienestar', exact: true});
  await expect(panel.getByRole('listitem')).toHaveCount(4);
  await expect(panel.getByRole('heading', {name: 'Fit Yoga'})).toBeVisible();
  await expect(panel.locator('[data-level="BRONZE"]')).toHaveCount(4);
  await expect(section.locator('#learning-panel-cursos')).toBeHidden();
  await wellness.press('Home');
  await expect(courses).toBeFocused();
  await wellness.focus();
  await wellness.press('Space');
  await expect(wellness).toHaveAttribute('aria-selected', 'true');
  await courses.click();
  await expect(courses).toHaveAttribute('aria-selected', 'true');
});

test('arrows, rapid boundary shortcuts and tab changes leave coupon roll independent', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/#aprendizaje');
  const section = page.locator('#aprendizaje');
  const panel = section.getByRole('tabpanel', {name: 'Cursos', exact: true});
  const next = section.getByRole('button', {name: 'Ver más cursos', exact: true});
  const prev = section.getByRole('button', {name: 'Ver cursos anteriores', exact: true});
  await expect(prev).toBeDisabled();
  await next.click();
  expect(await panel.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.locator('[data-brands-viewport]').evaluate(el => el.scrollLeft)).toBe(0);
  await panel.press('End');
  await expect(next).toBeDisabled();
  await panel.press('Home');
  await expect(prev).toBeDisabled();
  await section.getByRole('tab', {name: 'Bienestar', exact: true}).click();
  await expect(section.getByRole('button', {name: 'Ver contenidos de bienestar anteriores'})).toBeDisabled();
  await expect(section.getByRole('button', {name: 'Ver más contenidos de bienestar'})).toBeEnabled();
  await section.getByRole('tab', {name: 'Cursos', exact: true}).click();
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await next.click();
  await panel.press('Home');
  await page.waitForTimeout(500);
  await expect(prev).toBeDisabled();
  expect(await panel.evaluate(el => el.scrollLeft)).toBeLessThanOrEqual(2);
});

test('missing covers keep a readable title and intentional placeholder', async ({page}) => {
  await page.route('https://i.vimeocdn.com/**', route => route.abort());
  await page.goto('/#aprendizaje');
  const card = page.locator('#learning-panel-cursos li').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('img')).toBeHidden();
  await expect(card.locator('.learning-preview__placeholder')).toBeVisible();
  await expect(card.getByRole('heading')).toHaveText('Gestión Financiera Personal');
});

test('without JavaScript both lists and registration remain available', async ({browser}, testInfo) => {
  const context = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  await page.route('https://i.ytimg.com/**', route => route.abort());
  await page.route('https://i.vimeocdn.com/**', route => route.fulfill({contentType: 'image/svg+xml', body: cover}));
  await page.goto(`${testInfo.project.use.baseURL}/#aprendizaje`);
  await expect(page.locator('#aprendizaje [data-learning-group]:visible')).toHaveCount(2);
  await expect(page.locator('#aprendizaje li')).toHaveCount(10);
  await expect(page.locator('#aprendizaje button:visible')).toHaveCount(0);
  await expect(page.locator('#aprendizaje').getByRole('link', {name: 'Bienestar', exact: true})).toHaveAttribute('href', '#learning-panel-bienestar');
  const viewport = page.locator('#learning-panel-bienestar');
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator('#aprendizaje').getByRole('link', {name: 'Únete a Rewards'})).toHaveAttribute('href', '/registro');
  await context.close();
});

for (const [width, columns] of [[320, 1], [390, 1], [768, 2], [1440, 3]]) {
  test(`compact ${columns}-column preview at ${width}px keeps side controls clear`, async ({page}) => {
    await page.setViewportSize({width, height: 950});
    await page.goto('/#aprendizaje');
    await page.evaluate(() => document.fonts.ready);
    const panel = page.locator('#learning-panel-cursos');
    const section = page.locator('#aprendizaje');
    const header = section.locator('.learning-preview__header');
    const headingBox = (await section.locator('#learning-preview-title').boundingBox())!;
    const headerBox = (await header.boundingBox())!;
    const tabsBox = (await section.getByRole('tablist').boundingBox())!;
    expect(await header.evaluate(el => getComputedStyle(el).textAlign)).toBe('center');
    expect(Math.abs(headingBox.x + headingBox.width / 2 - headerBox.x - headerBox.width / 2)).toBeLessThan(1);
    expect(Math.abs(tabsBox.x + tabsBox.width / 2 - headerBox.x - headerBox.width / 2)).toBeLessThan(1);
    expect(tabsBox.y).toBeGreaterThan(headingBox.y + headingBox.height);
    const box = (await panel.boundingBox())!;
    const card = (await panel.locator('li').first().boundingBox())!;
    expect(Math.abs(card.width - (box.width - (columns - 1) * 16) / columns)).toBeLessThan(2);
    const left = (await section.getByRole('button', {name: 'Ver cursos anteriores'}).boundingBox())!;
    const right = (await section.getByRole('button', {name: 'Ver más cursos', exact: true}).boundingBox())!;
    expect(left.width).toBe(44);
    expect(left.x + left.width).toBeLessThanOrEqual(box.x);
    expect(right.x).toBeGreaterThanOrEqual(box.x + box.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await panel.press('End');
    await expect(section.getByRole('button', {name: 'Ver más cursos', exact: true})).toBeDisabled();
    await page.setViewportSize({width: width === 1440 ? 390 : 1440, height: 950});
    await panel.press('Home');
    await expect(section.getByRole('button', {name: 'Ver cursos anteriores'})).toBeDisabled();
    await expect(section.getByRole('button', {name: 'Ver más cursos', exact: true})).toBeEnabled();
  });
}
