import { expect, test, type Locator } from '@playwright/test';

async function next(dialog: Locator) {
  await dialog.page().waitForTimeout(420);
  await dialog.locator('[data-next]').click();
}
async function vehicle(dialog: Locator) {
  await dialog.locator('[name=brand]').fill('Toyota');
  await dialog.locator('[name=model]').fill('Corolla');
  await dialog.locator('[name=year]').fill('2023');
  await dialog.locator('[name=postalCode]').fill('01010');
  await dialog.locator('[name=use]').selectOption('Particular');
}

for (const journey of ['cotizar', 'mejorar'] as const) for (const coverage of ['Básica', 'Necesito orientación']) {
  test(`${journey} / ${coverage}: full demo validates, survives closing, reviews and clears after completion`, async ({ page }, info) => {
    const writes: string[] = [];
    page.on('request', request => { if (['POST', 'PUT', 'PATCH'].includes(request.method())) writes.push(request.url()); });
    await page.goto(`/preview/qualitas?plan=${journey}`);
    const dialog = page.locator(`[data-demo-wizard="${journey}"]`);
    await expect(dialog).toBeVisible();
    if (info.project.name.includes('mobile')) {
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBe(0); expect(bounds.y).toBe(0); expect(bounds.width).toBe(page.viewportSize()!.width);
    }
    await next(dialog);
    await expect(dialog.locator('[name=brand]')).toBeFocused();
    await vehicle(dialog);
    await dialog.locator('[name=postalCode]').fill('1234'); await next(dialog);
    await expect(dialog.locator('[name=postalCode]')).toHaveAttribute('aria-invalid', 'true');
    await dialog.locator('[name=postalCode]').fill('01010');
    await next(dialog);
    await dialog.locator('[name=driver]').selectOption('Yo');
    await dialog.locator('[name=ageGroup]').selectOption('25 a 39 años');
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
    await page.locator(`[data-open-demo="${journey}"]`).click();
    await expect(dialog.locator('[name=driver]')).toHaveValue('Yo');
    await next(dialog);
    if (journey === 'cotizar') {
      await expect(dialog.locator('[name=coverage] option')).toHaveText(['Selecciona una opción', 'Amplia', 'Limitada', 'Básica', 'Necesito orientación']);
      await dialog.locator('[name=coverage]').selectOption(coverage);
      await dialog.locator('[name=priority]').selectOption('Proteger mi auto');
    } else {
      await dialog.locator('[name=insurer]').selectOption('Otra aseguradora');
      await dialog.locator('[name=currentCoverage]').selectOption('Limitada');
      await dialog.locator('[name=expiry]').fill('2026-12-31');
    }
    await next(dialog);
    if (journey === 'mejorar') {
      await dialog.locator('[name=change]').selectOption('Coberturas');
      await expect(dialog.locator('[name=coverage] option')).toHaveText(['Selecciona una opción', 'Amplia', 'Limitada', 'Básica', 'Necesito orientación']);
      await dialog.locator('[name=coverage]').selectOption(coverage);
    }
    await dialog.locator('[name=urgency]').selectOption('Solo estoy explorando');
    await next(dialog); await next(dialog);
    await expect(dialog.locator('[data-error]')).toContainText('datos ficticios');
    await dialog.locator('[name=consent]').check(); await next(dialog);
    await expect(dialog.locator('[data-summary]')).toBeVisible();
    await expect(dialog.locator('[data-answers]')).toContainText('01010');
    await expect(dialog.locator('[data-answers] > div').filter({ has: page.getByText('Cobertura que te interesa', { exact: true }) }).locator('dd')).toHaveText(coverage);
    await expect(dialog.locator('[data-summary]')).toContainText('Sin precio ni propuesta comercial');
    await dialog.locator('[data-back]').click();
    await page.waitForTimeout(420); await dialog.locator('[data-next]').dblclick();
    await expect(dialog.locator('[data-summary]')).toBeVisible();
    await expect(dialog.locator('[data-success]')).not.toBeVisible();
    await next(dialog);
    await expect(dialog.locator('[data-success]')).toContainText('No se ha enviado ninguna solicitud');
    await dialog.locator('[data-finish]').click();
    await page.locator(`[data-open-demo="${journey}"]`).click();
    await expect(dialog.locator('[name=brand]')).toHaveValue('');
    expect(writes).toEqual([]);
    await expect(page.locator('input[type=file]')).toHaveCount(0);
  });
}

test('Qualitas information, narrow viewport, cancel and reload stay local', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiCalls.push(request.url()); });
  await page.goto('/preview/qualitas');
  await expect(page.getByRole('heading', { name: '¿En qué punto estás?' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Documentación', exact: true }).click();
  await expect(page.getByText('En esta vista no pedimos ni recibimos archivos.', { exact: false })).toBeVisible();
  await page.locator('[data-open-demo=cotizar]').click();
  const dialog = page.locator('[data-demo-wizard=cotizar]');
  await vehicle(dialog);
  await dialog.locator('[data-discard]').click();
  await page.locator('[data-open-demo=cotizar]').click();
  await expect(dialog.locator('[name=brand]')).toHaveValue('');
  await vehicle(dialog); await page.reload();
  await page.locator('[data-open-demo=cotizar]').click();
  await expect(dialog.locator('[name=brand]')).toHaveValue('');
  expect(apiCalls).toEqual([]);
});
