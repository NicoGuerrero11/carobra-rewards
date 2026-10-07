import { expect, test, type Page, type Locator } from '@playwright/test';

async function open(page: Page, kind?: 'ahorro' | 'retiro') {
  await page.goto('/preview/skandia');
  if (kind) await page.locator(`[data-open-plan="${kind}"]`).click();
  return page.locator(`dialog[data-plan="${kind ?? 'ahorro'}"]`);
}
async function next(dialog: Locator) {
  // Allow the intentional double-click guard to expire between distinct actions.
  await dialog.page().waitForTimeout(420);
  await dialog.locator('[data-next]').click();
}
async function savings(dialog: Locator) {
  await dialog.locator('[name=goal]').selectOption('Educación');
  await dialog.locator('[name=years]').fill('10');
  await next(dialog);
  await dialog.locator('[name=contribution]').fill('1500');
  await dialog.locator('[name=frequency]').selectOption('Mensual');
  await dialog.locator('[name=expectation]').selectOption('Crear el hábito de ahorrar');
  await next(dialog);
  await dialog.locator('[name=tax]').selectOption('No estoy seguro/a');
  await dialog.locator('[name=start]').selectOption('Solo estoy explorando');
  await next(dialog);
}

test('information is freely browsable, responsive and does not call APIs', async ({ page }, info) => {
  const apiCalls: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiCalls.push(request.url()); });
  await open(page);
  await expect(page.getByRole('heading', { name: /Lo que imaginas/ })).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Antes de decidir', exact: true }).click();
  await page.getByText('Plazos y edad', { exact: false }).click();
  await expect(page.getByText(/plazos de 5–25 y de 10–25/)).toBeVisible();
  await page.locator('#preguntas summary').first().click();
  await expect(page.getByText('No. Toda la información de esta página')).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize(info.project.name.includes('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('skandia-page.png'), fullPage: true, style: 'astro-dev-toolbar { visibility: hidden !important; }' });
  expect(apiCalls).toEqual([]);
});

test('savings validates, preserves on close/back, calculates contributions and confirms only a simulation', async ({ page }, info) => {
  const writes: string[] = [];
  page.on('request', request => { if (['POST', 'PUT', 'PATCH'].includes(request.method())) writes.push(request.url()); });
  const dialog = await open(page, 'ahorro');
  await next(dialog);
  await expect(dialog.getByRole('alert')).toContainText('Completa este campo');
  await expect(dialog.locator('[name=goal]')).toBeFocused();
  await dialog.locator('[name=goal]').selectOption('Educación');
  await dialog.locator('[name=years]').fill('1.5');
  await next(dialog);
  await expect(dialog.locator('[name=years]')).toHaveAttribute('aria-invalid', 'true');
  await dialog.locator('[name=years]').fill('10');
  await dialog.getByRole('button', { name: 'Cerrar cuestionario' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('[data-open-plan=ahorro]')).toBeFocused();
  await page.locator('[data-open-plan=ahorro]').click();
  await expect(dialog.locator('[name=goal]')).toHaveValue('Educación');
  await savings(dialog);
  await next(dialog);
  await expect(dialog.getByRole('alert')).toContainText('datos ficticios');
  await dialog.locator('[name=consent]').check();
  await next(dialog);
  await expect(dialog.locator('[data-total]')).toHaveText('$180,000.00');
  await expect(dialog.locator('[data-answers]')).toContainText('Sin definir');
  await expect(dialog.locator('[data-summary]')).toContainText('No es una cotización');
  await dialog.locator('[data-back]').click();
  await expect(dialog.locator('[name=consent]')).toBeChecked();
  await next(dialog);
  await page.screenshot({ path: info.outputPath('skandia-summary.png'), fullPage: false, style: 'astro-dev-toolbar { visibility: hidden !important; }' });
  await page.waitForTimeout(420);
  await dialog.locator('[data-next]').dblclick();
  await expect(dialog.getByRole('heading', { name: 'Simulación completada' })).toBeVisible();
  await expect(dialog.getByText('No se ha enviado ninguna solicitud.', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('skandia-confirmation.png'), fullPage: false, style: 'astro-dev-toolbar { visibility: hidden !important; }' });
  await dialog.getByRole('button', { name: 'Volver a Skandia' }).click();
  await page.locator('[data-open-plan=ahorro]').click();
  await expect(dialog.locator('[name=goal]')).toHaveValue('');
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)))).toEqual([]);
});

test('retirement has three steps, validates positive amounts and supports discard and escape', async ({ page }, info) => {
  const dialog = await open(page, 'retiro');
  if (info.project.name.includes('mobile')) {
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBe(0); expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(page.viewportSize()!.width);
  }
  await dialog.locator('[name=retirementAge]').fill('65');
  await dialog.locator('[name=contribution]').fill('-10');
  await dialog.locator('[name=frequency]').selectOption('Trimestral');
  await next(dialog);
  await expect(dialog.locator('[name=contribution]')).toBeFocused();
  await dialog.locator('[name=contribution]').fill('3000');
  await next(dialog);
  await dialog.locator('[name=tax]').selectOption('Sí');
  await dialog.locator('[name=expectation]').selectOption('Complementar mi retiro');
  await dialog.locator('[name=start]').selectOption('En los próximos meses');
  await next(dialog);
  await expect(dialog.getByText('Paso 3 de 3')).toBeVisible();
  await dialog.locator('[name=consent]').check();
  await next(dialog);
  await expect(dialog.locator('[data-total]')).toHaveText('$12,000.00');
  await expect(dialog.locator('[data-total-label]')).toHaveText('Tus aportaciones en un año');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.locator('[data-open-plan=retiro]').click();
  await expect(dialog.locator('[data-summary]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Descartar y salir' }).click();
  await page.locator('[data-open-plan=retiro]').click();
  await expect(dialog.locator('[name=retirementAge]')).toHaveValue('');
  await page.screenshot({ path: info.outputPath('skandia-retirement.png'), fullPage: false, style: 'astro-dev-toolbar { visibility: hidden !important; }' });
});

test('catalog navigation, browser back/forward and auth preserve only an allowlisted intent', async ({ page }) => {
  await page.goto('/cliente/productos/skandia?plan=retiro');
  await expect(page).toHaveURL(/\/login\?next=/);
  const registration = page.getByRole('link', { name: 'Regístrate aquí' });
  await registration.click();
  await expect(page).toHaveURL(/\/registro\?next=/);
  await page.getByRole('link', { name: 'Inicia sesión', exact: true }).click();
  await page.locator('[name=email]').fill('ada@example.com');
  await page.locator('[name=password]').fill('correct-horse-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/cliente/productos/skandia?plan=retiro');
  await expect(page.locator('dialog[data-plan=retiro]')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar cuestionario' }).click();
  await page.getByRole('link', { name: '← Productos', exact: true }).click();
  await expect(page).toHaveURL('/cliente/productos');
  await page.getByRole('link', { name: 'Explorar Skandia', exact: true }).click();
  await expect(page).toHaveURL('/cliente/productos/skandia');
  await page.goBack(); await expect(page).toHaveURL('/cliente/productos');
  await page.goForward(); await expect(page).toHaveURL('/cliente/productos/skandia');
  await page.context().clearCookies();
  await page.goto('/login?next=https://example.com');
  await expect(page.getByRole('link', { name: 'Regístrate aquí' })).toHaveAttribute('href', '/registro');
});

test('reload clears the exercise and rapid clicks do not skip a step', async ({ page }) => {
  const dialog = await open(page, 'ahorro');
  await savings(dialog);
  await dialog.locator('[name=consent]').check();
  await next(dialog);
  await dialog.locator('[data-back]').click();
  await page.waitForTimeout(420);
  await dialog.locator('[data-next]').dblclick();
  await expect(dialog.locator('[data-summary]')).toBeVisible();
  await expect(dialog.locator('[data-success]')).not.toBeVisible();
  await page.reload();
  await page.locator('[data-open-plan=ahorro]').click();
  await expect(dialog.locator('[name=goal]')).toHaveValue('');
  await expect(dialog.locator('[name=years]')).toHaveValue('');
});
