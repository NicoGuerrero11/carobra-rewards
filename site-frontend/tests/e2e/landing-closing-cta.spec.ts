import {expect, test} from '@playwright/test';

const heading = 'Tu siguiente paso empieza aquí.';
const intro = 'Descubre los beneficios, cursos y bienestar disponibles para tu nivel en Carobra Rewards.';

function contrast(first: string, second: string) {
  const luminance = (color: string) => {
    const values = color.match(/\d+/g)!.slice(0, 3).map(channel => {
      const value = Number(channel) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

test.beforeEach(async ({page}) => {
  await page.route('https://i.ytimg.com/**', route => route.abort());
  await page.route('https://i.vimeocdn.com/**', route => route.abort());
});

test('closing invitation has approved copy, clear contrast and one primary CTA before the separate footer', async ({page}) => {
  const requests: string[] = [];
  page.on('request', req => { if (req.url().includes('/api/')) requests.push(req.url()); });
  await page.goto('/#confianza');
  const section = page.getByRole('region', {name: heading});
  await expect(section.locator('.closing-invitation__intro')).toHaveText(intro);
  await expect(section.locator('.closing-invitation__signin')).toHaveText('¿Ya tienes cuenta? Inicia sesión');
  await expect(section.getByRole('link')).toHaveCount(2);
  await expect(section.locator('img, iframe, video, script, button')).toHaveCount(0);
  await expect(page.locator('.trust, .trust__cta, .trust__cta-secondary')).toHaveCount(0);
  await expect(page.getByText('Un programa que crece contigo', {exact: true})).toHaveCount(0);
  await expect(page.getByText(/confirma cada avance antes de mostrarlo/)).toHaveCount(0);
  expect(await section.evaluate(el => el.previousElementSibling?.id)).toBe('quienes-somos');
  expect(await section.evaluate(el => el.nextElementSibling)).toBeNull();
  expect(await page.locator('main').evaluate(el => el.nextElementSibling?.tagName)).toBe('FOOTER');
  await expect(page.locator('.landing-footer a[href="mailto:soporte@carobra.mx"]')).toBeVisible();
  const join = section.getByRole('link', {name: 'Únete a Rewards', exact: true});
  const login = section.getByRole('link', {name: 'Inicia sesión', exact: true});
  await expect(join).toHaveAttribute('href', '/registro');
  await expect(login).toHaveAttribute('href', '/login');
  expect(await join.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await login.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await login.evaluate(el => getComputedStyle(el).textDecorationLine)).toContain('underline');
  const gradient = await section.evaluate(el => getComputedStyle(el).backgroundImage);
  const colors = gradient.match(/rgb\([^)]+\)/g)!;
  expect(colors.length).toBe(2);
  for (const element of await section.locator('h2, .closing-invitation__intro, .closing-invitation__signin, .closing-invitation__signin a').all()) {
    const color = await element.evaluate(el => getComputedStyle(el).color);
    for (const background of colors) expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(await join.evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(4.5);
  expect(requests).toEqual([]);
});

test('account links have visible keyboard focus and reach the existing routes', async ({page}) => {
  for (const [name, route] of [['Únete a Rewards', '/registro'], ['Inicia sesión', '/login']]) {
    await page.goto('/#confianza');
    const link = page.locator('#confianza').getByRole('link', {name, exact: true});
    await link.focus();
    await expect(link).toBeFocused();
    expect(await link.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await link.evaluate(el => getComputedStyle(el).outlineOffset)).toBe('5px');
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await link.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.getByRole('heading', {name: route === '/login' ? 'Iniciar sesión' : /registro|cuenta/i}).first()).toBeVisible();
  }
});

test('Confianza menu anchor reveals the closing heading below the sticky header', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/');
  const link = page.getByRole('navigation', {name: 'Navegación principal'}).getByRole('link', {name: 'Confianza', exact: true});
  await expect(link).toHaveAttribute('href', '#confianza');
  await link.focus();
  await link.press('Enter');
  await expect(page).toHaveURL(/#confianza$/);
  await expect.poll(async () => {
    const header = (await page.locator('.landing-header').boundingBox())!;
    const title = (await page.locator('#closing-invitation-title').boundingBox())!;
    return title.y >= header.y + header.height && title.y + title.height < 1000;
  }).toBe(true);
});

test('closing invitation and both account links work without JavaScript', async ({browser}) => {
  const context = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 900}});
  await context.route('https://i.ytimg.com/**', route => route.abort());
  await context.route('https://i.vimeocdn.com/**', route => route.abort());
  const page = await context.newPage();
  for (const [name, route] of [['Únete a Rewards', '/registro'], ['Inicia sesión', '/login']]) {
    await page.goto('http://127.0.0.1:4322/#confianza');
    await expect(page.locator('#closing-invitation-title')).toHaveText(heading);
    await expect(page.locator('.closing-invitation__intro')).toHaveText(intro);
    await page.locator('#confianza').getByRole('link', {name, exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
  }
  await context.close();
});

for (const width of [320, 390, 768, 1440]) {
  test(`closing invitation stays compact and readable at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/#confianza');
    await page.evaluate(() => document.fonts.ready);
    const section = page.locator('#confianza');
    expect(await section.locator('.shell').evaluate(el => getComputedStyle(el).textAlign)).toBe('center');
    for (const element of await section.locator('h2, p, a').all()) {
      const box = (await element.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(await element.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    const button = (await section.locator('.closing-invitation__join').boundingBox())!;
    const signin = (await section.locator('.closing-invitation__signin').boundingBox())!;
    expect(signin.y).toBeGreaterThan(button.y + button.height);
    const footer = (await page.locator('.landing-footer').boundingBox())!;
    const sectionBox = (await section.boundingBox())!;
    expect(footer.y).toBeGreaterThanOrEqual(sectionBox.y + sectionBox.height - 1);
    if (width === 1440) {
      expect(sectionBox.height).toBeLessThan(380);
      expect(button.width).toBeLessThan(300);
    }
  });
}

test('200% text at 320px leaves all closing text and links unclipped', async ({page}) => {
  await page.setViewportSize({width: 320, height: 1000});
  await page.goto('/#confianza');
  await page.addStyleTag({content: 'html {font-size: 200% !important}'});
  for (const element of await page.locator('#confianza h2, #confianza p, #confianza a').all()) {
    expect(await element.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
});
