import { expect, test } from '@playwright/test';

const brandNames = ['Cinépolis', 'Farmacias Benavides', 'Laboratorio Médico del Chopo',
  'Ópticas Devlyn', 'Harmon Hall', 'Martí', 'Sonora Prime', "Porfirio's", "Harry's Polanco"];

test.beforeEach(async ({ page }) => {
  await page.route('https://i.ytimg.com/**', route => route.abort());
});

test('shows source-backed local artwork with truthful preview copy and no external catalog calls', async ({ page }) => {
  const external: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    const publicLearningImage = url.hostname === 'i.vimeocdn.com' && request.resourceType() === 'image';
    if (!['127.0.0.1', 'i.ytimg.com'].includes(url.hostname) && !publicLearningImage) external.push(request.url());
  });
  await page.goto('/#catalogo');
  const section = page.locator('#catalogo');
  await expect(section.getByRole('listitem')).toHaveCount(9);
  for (const name of brandNames) {
    const image = section.getByRole('img', { name, exact: true });
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(image).toHaveAttribute('src', /^\/images\/coupon-brands\//);
    expect(await image.evaluate(img => getComputedStyle(img).objectFit)).toBe('contain');
  }
  await expect(section.getByText('Beneficios disponibles según tu nivel y las condiciones de cada promoción.')).toBeVisible();
  await expect(section.getByText(/Próximamente|Amazon|Soriana|Uber|Starbucks|\d+%/)).toHaveCount(0);
  await expect(section.locator('a')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('side arrows scroll in both directions and respect boundaries', async ({ page }) => {
  await page.goto('/#catalogo');
  const viewport = page.locator('[data-brands-viewport]');
  const previous = page.getByRole('button', { name: 'Ver marcas anteriores' });
  const next = page.getByRole('button', { name: 'Ver más marcas' });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(20);
  await expect(previous).toBeEnabled();
  await viewport.focus();
  await viewport.press('End');
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(next).toBeEnabled();
  await viewport.focus();
  await viewport.press('Home');
  await expect(previous).toBeDisabled();
  await expect(viewport).toBeFocused();
  // Home/End must interrupt in-flight smooth scrolling, not leave a partial page.
  await next.click();
  await viewport.focus();
  await viewport.press('Home');
  await expect(previous).toBeDisabled();
  await page.waitForTimeout(500);
  expect(await viewport.evaluate(el => el.scrollLeft)).toBeLessThanOrEqual(2);
});

test('keyboard navigation has visible focus, no automatic scrolling, and honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#catalogo');
  const viewport = page.locator('[data-brands-viewport]');
  await viewport.focus();
  expect(await viewport.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.waitForTimeout(600);
  expect(await viewport.evaluate(el => el.scrollLeft)).toBe(0);
  await viewport.press('ArrowRight');
  expect(await viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await viewport.press('ArrowLeft');
  expect(await viewport.evaluate(el => el.scrollLeft)).toBeLessThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Ver más marcas' })).toBeEnabled();
  await page.getByRole('button', { name: 'Ver más marcas' }).focus();
  await page.keyboard.press('Enter');
  expect(await viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
});

test('missing brand artwork falls back to its readable accessible name', async ({ page }) => {
  await page.route('**/images/coupon-brands/cinepolis.svg', route => route.abort());
  await page.goto('/#catalogo');
  await expect(page.locator('.coupon-brands__fallback').filter({ hasText: /^Cinépolis$/ })).toBeVisible();
  await expect(page.locator('.coupon-brands__mark[data-failed]')).toHaveCount(1);
  await expect(page.locator('.coupon-brands__mark[data-failed] img')).toBeHidden();
  await expect(page.locator('.coupon-brands__mark[data-failed] .coupon-brands__fallback')).not.toHaveAttribute('aria-hidden');
  await expect(page.getByRole('button', { name: 'Ver más marcas' })).toBeEnabled();
});

test('without JavaScript the native scrollable brand list still works', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route('https://i.ytimg.com/**', route => route.abort());
  await page.goto(`${testInfo.project.use.baseURL}/#catalogo`);
  await expect(page.locator('#catalogo li')).toHaveCount(9);
  await expect(page.locator('[data-brands-next]')).toBeHidden();
  await expect(page.locator('[data-brands-prev]')).toBeHidden();
  const viewport = page.locator('[data-brands-viewport]');
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await context.close();
});

for (const width of [320, 390, 1440]) {
  test(`roll fits ${width}px, arrows do not cover artwork and resize updates its state`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#catalogo');
    await page.evaluate(() => document.fonts.ready);
    const viewport = page.locator('[data-brands-viewport]');
    const previous = page.getByRole('button', { name: 'Ver marcas anteriores' });
    const next = page.getByRole('button', { name: 'Ver más marcas' });
    const box = (await viewport.boundingBox())!;
    const left = (await previous.boundingBox())!;
    const right = (await next.boundingBox())!;
    expect(left.x + left.width).toBeLessThanOrEqual(box.x);
    expect(right.x).toBeGreaterThanOrEqual(box.x + box.width);
    expect(left.width).toBeGreaterThanOrEqual(44);
    expect(right.width).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await next.evaluate(el => getComputedStyle(el).backgroundColor)).toMatch(/rgba\(.+, 0\.45\)/);
    const wordmark = await page.locator('.coupon-brands__mark--benavides').evaluate(el => {
      const frame = el.getBoundingClientRect();
      const image = el.querySelector('img')!.getBoundingClientRect();
      return { cropStart: (frame.left - image.left) / image.width, rightGap: frame.right - image.right };
    });
    // Crop only the separate emblem (x=0..38), never the first letters.
    expect(wordmark.cropStart).toBeCloseTo(38 / 150, 3);
    expect(Math.abs(wordmark.rightGap)).toBeLessThan(1);
    await viewport.focus();
    await viewport.press('End');
    await expect(next).toBeDisabled();
    await page.setViewportSize({ width: width === 1440 ? 390 : 1440, height: 900 });
    await viewport.focus();
    await viewport.press('Home');
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
  });
}
