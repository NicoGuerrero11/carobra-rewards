import { expect, test, type Page } from '@playwright/test';

async function openProducts(page: Page, session = 'e2e-eligible', failure = false) {
  await page.context().addCookies([
    { name: 'carobra_session', value: session, url: 'http://127.0.0.1:4322' },
    ...(failure ? [{ name: 'products-failure', value: 'true', url: 'http://127.0.0.1:4322' }] : []),
  ]);
  await page.goto('/cliente/productos');
}

test('catalog leads with real logos and preserves linked product details', async ({ page }, testInfo) => {
  await openProducts(page);
  await expect(page.locator('.showcase-card')).toHaveCount(3);
  await expect(page.locator('main')).not.toContainText(/impulsar tu avance hacia Oro|identificadores temporales|antes de tomar una decisión|lo que puedes revisar|explorar mis beneficios|conocer más|una relación que suma/i);
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('.showcase-rewards')).toHaveCount(0);
  expect(await page.locator('.showcase-grid').evaluate(el => !!(el.compareDocumentPosition(document.querySelector('#mis-productos')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  for (const img of await page.locator('.showcase-card img').all()) {
    await expect.poll(() => img.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect((await img.boundingBox())!.width).toBeGreaterThanOrEqual(180);
  }
  await expect(page.getByRole('heading', { name: 'Cuenta de retiro' })).toBeVisible();
  await page.locator('.showcase-account summary').first().click();
  await expect(page.getByText('Efecto en tu nivel')).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('products.png'), fullPage: true, style: 'astro-dev-toolbar { visibility: hidden !important; }' });
});

test('compact catalog fits three desktop cards and adapts to tablet', async ({ page }) => {
  await openProducts(page);
  for (const width of [1280, 1024, 768, 600]) {
    await page.setViewportSize({ width, height: 900 });
    const cards = await page.locator('.showcase-card').all();
    const bounds = await Promise.all(cards.map(card => card.boundingBox()));
    expect(bounds[1]!.y).toBeCloseTo(bounds[0]!.y, 0);
    expect(bounds[1]!.x).toBeGreaterThan(bounds[0]!.x);
    if (width >= 1000) {
      expect(bounds[2]!.y).toBeCloseTo(bounds[0]!.y, 0);
      expect(bounds[2]!.x).toBeGreaterThan(bounds[1]!.x);
      // Includes the new compact reward label above the existing contact action.
      for (const box of bounds) expect(box!.height).toBeLessThan(500);
      const actions = await Promise.all(cards.map(card => card.locator('.showcase-primary').boundingBox()));
      expect(actions[1]!.y).toBeCloseTo(actions[0]!.y, 0);
      expect(actions[2]!.y).toBeCloseTo(actions[0]!.y, 0);
    } else {
      expect(bounds[2]!.y).toBeGreaterThan(bounds[0]!.y + bounds[0]!.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const card of cards) {
      expect((await card.locator('.showcase-card__brand').boundingBox())!.height).toBeLessThanOrEqual(136);
      for (const text of await card.locator('.showcase-card__headline, .showcase-card__description').all()) {
        expect(await text.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }
    }
  }
});

test('each product shows only its owner-confirmed reward amount above contact', async ({ page }) => {
  await openProducts(page);
  await expect(page.locator('.showcase-card__reward')).toHaveCount(3);
  for (const [name, amount] of [['Skandia', 600], ['Quálitas', 150], ['Modalidad 40', 600]] as const) {
    const card = page.getByRole('article', { name, exact: true });
    const reward = card.locator('.showcase-card__reward');
    await expect(reward).toBeVisible();
    await expect(reward.locator('strong')).toHaveText(`+${amount}`);
    await expect(reward).toContainText('puntos Rewards');
    const rewardBox = (await reward.boundingBox())!;
    const contactBox = (await card.locator('.showcase-primary').boundingBox())!;
    expect(rewardBox.y + rewardBox.height).toBeLessThanOrEqual(contactBox.y);
    await expect(card).not.toContainText(/acreditados|saldo actualizado|sube de nivel|al confirmarse|al validar|automáticamente/i);
  }
  await expect(page.locator('.showcase-card button, .showcase-card form')).toHaveCount(0);
});

test('all products offer direct keyboard accessible contact with correct context', async ({ page }) => {
  await openProducts(page);
  for (const [name, label] of [
    ['Skandia', 'Quiero empezar a ahorrar'],
    ['Quálitas', 'Quiero proteger mi auto'],
    ['Modalidad 40', 'Quiero planear mi retiro'],
  ]) {
    const panel = page.getByRole('article', { name, exact: true });
    const contact = panel.getByRole('link', { name: `${label} (${name}), contactar por correo` });
    await expect(contact).toBeVisible();
    await expect(contact).toContainText(label);
    await expect(contact).toHaveAttribute('href', `mailto:soporte@carobra.mx?subject=${encodeURIComponent(`Quiero información sobre ${name}`)}`);
    await contact.focus();
    await expect(contact).toBeFocused();
    expect(await contact.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(contact).toBeFocused();
    await expect(panel.getByText('Contacto por correo')).toBeVisible();
  }
  const closing = page.locator('.showcase-advisor');
  await expect(closing.getByRole('heading', { name: 'Hablemos de lo que quieres lograr.' })).toBeVisible();
  await expect(closing.getByText('Da el siguiente paso con el equipo Carobra.')).toBeVisible();
  const closingContact = closing.getByRole('link', { name: 'Contactar a un asesor por correo' });
  await expect(closingContact).toContainText('Contactar a un asesor');
  await expect(closingContact).toHaveAttribute('href', 'mailto:soporte@carobra.mx?subject=Quiero%20orientaci%C3%B3n%20sobre%20productos%20Carobra');
  await expect(page.locator('main a[href*="wa.me"], main a[href*="whatsapp"], main form')).toHaveCount(0);
});

test('pending and temporarily unavailable accounts retain discovery', async ({ page }) => {
  await openProducts(page, 'e2e-pending');
  await expect(page.getByText('Aún no hay productos confirmados')).toBeVisible();
  await expect(page.locator('.showcase-card')).toHaveCount(3);
  await openProducts(page, 'e2e-eligible', true);
  await expect(page.getByText(/No pudimos cargar tus productos/)).toBeVisible();
  await expect(page.locator('.showcase-card')).toHaveCount(3);
  await expect(page.locator('.showcase-account__list')).toHaveCount(0);
});

test('320px panels stack without overflow and retain contact actions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openProducts(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const panel of await page.locator('.showcase-card').all()) {
    expect((await panel.boundingBox())!.height).toBeLessThan(500);
    const visual = (await panel.locator('.showcase-card__brand').boundingBox())!;
    const body = (await panel.locator('.showcase-card__body').boundingBox())!;
    expect(body.y).toBeGreaterThanOrEqual(visual.y + visual.height - 1);
    const contact = panel.getByRole('link', { name: /Quiero/ });
    expect(await contact.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await contact.scrollIntoViewIfNeeded();
    await expect(contact).toBeInViewport();
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('products-320.png'), fullPage: true, style: 'astro-dev-toolbar { visibility: hidden !important; }' });
});
