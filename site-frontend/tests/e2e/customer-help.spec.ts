import { expect, test, type BrowserContext } from '@playwright/test';

async function cookies(context: BrowserContext, extra: Record<string, string> = {}) {
  await context.addCookies(Object.entries({ carobra_session: 'e2e-eligible', ...extra })
    .map(([name, value]) => ({ name, value, url: 'http://127.0.0.1:4322' })));
}

test('five topics and fifteen actionable answers preserve current rules without writes', async ({ page, context }, info) => {
  await cookies(context);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  const response = await page.goto('/cliente/ayuda');
  expect(response?.headers()['cache-control']).toBe('private, no-store');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿En qué podemos ayudarte?');
  await expect(page.getByRole('navigation', { name: 'Temas de ayuda' }).getByRole('link')).toHaveCount(5);
  await expect(page.locator('.help-faqs details')).toHaveCount(15);
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('help.png'), fullPage: true });
  for (const summary of await page.locator('.help-faqs summary').all()) await summary.click();
  await expect(page.locator('#beneficios-usar strong').first()).toHaveText('Beneficios no consumen puntos');
  await expect(page.locator('#cursos-acceso')).toContainText('Cursos se habilitan por nivel');
  await expect(page.locator('#cursos-acceso')).toContainText('Bienestar está disponible completo desde Bronce');
  await expect(page.locator('#cursos-completar')).toContainText('todos sus videos');
  await expect(page.locator('#cursos-completar')).toContainText('no acredita puntos ni emite certificados');
  await expect(page.locator('#productos-puntos')).toContainText('no una acreditación en tu cuenta');
  await expect(page.locator('#puntos-consultar')).toContainText('Leer un aviso no modifica tu saldo');
  const hrefs = await page.locator('.help-faqs a').evaluateAll(links => links.map(a => a.getAttribute('href')));
  expect(hrefs).toEqual(expect.arrayContaining(['/cliente/recompensas', '/cliente/activities', '/cliente/notificaciones', '/cliente/beneficios', '/cliente/cursos', '/cliente/cursos?tipo=cursos', '/cliente/cursos?tipo=bienestar', '/cliente/productos']));
  await expect(page.locator('.help-context > a')).toHaveAttribute('href', '/cliente/perfil');
  const allowed = new Set(['/cliente/perfil', '/cliente/recompensas', '/cliente/activities', '/cliente/notificaciones', '/cliente/beneficios', '/cliente/cursos', '/cliente/cursos?tipo=cursos', '/cliente/cursos?tipo=bienestar', '/cliente/productos']);
  for (const href of hrefs) expect(allowed.has(href!)).toBe(true);
  expect(writes).toEqual([]);
});

test('topic anchors and problem shortcuts work by keyboard, on reload and repeated clicks', async ({ page, context }, info) => {
  await cookies(context);
  await page.goto('/cliente/ayuda');
  const topic = page.locator('.help-topics a[href="#cursos"]');
  await topic.focus();
  await topic.press('Enter');
  await expect(page.locator('#cursos')).toBeFocused();
  expect(await page.locator('#cursos').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(90);
  const summary = page.locator('#cursos-acceso summary');
  await summary.focus();
  await summary.press('Enter');
  await expect(page.locator('#cursos-acceso')).toHaveAttribute('open', '');
  await summary.press('Space');
  await expect(page.locator('#cursos-acceso')).not.toHaveAttribute('open', '');
  const shortcut = page.getByRole('navigation', { name: 'Problemas frecuentes' }).getByRole('link', { name: 'No aparece mi avance' });
  await shortcut.click();
  await expect(page.locator('#cursos-completar')).toHaveAttribute('open', '');
  await expect(page.locator('#cursos-completar summary')).toBeFocused();
  await page.reload();
  await expect(page.locator('#cursos-completar')).toHaveAttribute('open', '');
  await page.locator('#cursos-completar summary').click();
  await shortcut.click();
  await expect(page.locator('#cursos-completar')).toHaveAttribute('open', '');
  await page.screenshot({ path: info.outputPath('help-answer.png') });
  for (const id of ['catalogo-no-carga', 'video-no-carga', 'beneficio-no-aceptado']) {
    await page.locator(`.help-troubleshooting a[href="#${id}"]`).click();
    await expect(page.locator(`#${id}`)).toHaveAttribute('open', '');
  }
});

test('account context is preserved for different authenticated journeys', async ({ page, context }) => {
  const states = {
    'e2e-eligible': 'gastar puntos no lo reduce',
    'e2e-pending': 'Carobra está confirmando tu primer producto',
    'e2e-attention': 'Carobra necesita revisar información',
    'e2e-inactive': 'Tus movimientos permanecen protegidos',
  };
  for (const [session, expected] of Object.entries(states)) {
    await cookies(context, { carobra_session: session, 'help-fixture': 'state' });
    await page.goto('/cliente/ayuda');
    await page.locator('.help-context summary').click();
    await expect(page.locator('.help-context .help-answer')).toContainText(expected);
    await expect(page.locator('.help-faqs details')).toHaveCount(15);
  }
});

test('general help survives unavailable or empty portal guidance and safely renders account text', async ({ page, context }) => {
  await cookies(context, { 'products-failure': 'true' });
  await page.goto('/cliente/ayuda');
  await expect(page.getByRole('status')).toContainText('Las preguntas generales siguen disponibles.');
  await expect(page.locator('.help-faqs details')).toHaveCount(15);
  await page.locator('.help-troubleshooting a[href="#video-no-carga"]').click();
  await expect(page.locator('#video-no-carga .help-answer')).toBeVisible();
  await cookies(context, { 'products-failure': 'false', 'help-fixture': 'empty' });
  await page.goto('/cliente/ayuda');
  await expect(page.locator('.help-context')).toContainText('Puedes consultar tus datos personales y preferencias');
  await expect(page.getByRole('status')).toHaveCount(0);
  await cookies(context, { 'help-fixture': 'markup' });
  await page.reload();
  await expect(page.locator('.help-context summary')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.help-context img,.help-context script')).toHaveCount(0);
});

test('example support is explicitly non-operational and separate from product information', async ({ page, context }) => {
  await cookies(context);
  await page.goto('/cliente/ayuda');
  const contact = page.getByRole('region', { name: 'Soporte Rewards', exact: true });
  await expect(contact).toContainText('Correo de ejemplo');
  await expect(contact).toContainText('soporte@carobra.com');
  await expect(contact).toContainText('no es un canal de atención habilitado');
  await expect(contact.locator('a,button,form')).toHaveCount(0);
  await expect(page.locator('main a[href^="mailto:"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Conocer productos', exact: true }).click();
  await expect(page).toHaveURL(/\/cliente\/productos$/);
  await expect(page.getByRole('heading', { name: 'Nuestras soluciones' })).toBeVisible();
});

test('compact branded typography and open answers stay readable at 320px', async ({ page, context }, info) => {
  await cookies(context);
  await page.goto('/cliente/ayuda');
  const titleSize = await page.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(titleSize).toBeLessThanOrEqual(38);
  const start = await page.evaluate(() => ({ title: document.querySelector('h1')!.getBoundingClientRect().top, header: document.querySelector('.client-shell__topnav')!.getBoundingClientRect().bottom }));
  expect(start.title).toBeGreaterThanOrEqual(start.header);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator('#beneficios-usar summary').click();
  await page.locator('#cursos-acceso summary').click();
  await page.locator('#productos-informacion summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const ratios = await page.locator('main').evaluate(main => {
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
      .map(n => { const c = n / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; })
      .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const background = (el: Element): string => {
      const color = getComputedStyle(el).backgroundColor;
      return color === 'rgba(0, 0, 0, 0)' && el.parentElement ? background(el.parentElement) : color;
    };
    return [...main.querySelectorAll('h1,h2,p,summary,strong,small,a,.help-contact-example > span')].filter(el => el.getBoundingClientRect().height && el.textContent?.trim()).map(el => {
      const a = luminance(getComputedStyle(el).color), b = luminance(background(el));
      return { text: el.textContent, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
  for (const item of ratios) expect(item.ratio, item.text ?? '').toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: info.outputPath('help-320.png'), fullPage: true });
});

test('general FAQ accordions and links work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await cookies(context);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/cliente/ayuda');
  await page.locator('#cursos-acceso summary').click();
  await expect(page.locator('#cursos-acceso .help-answer')).toBeVisible();
  await page.getByRole('link', { name: 'Ver bienestar', exact: true }).click();
  await expect(page).toHaveURL(/\/cliente\/cursos\?tipo=bienestar$/);
  await context.close();
});

test('anonymous access remains protected', async ({ page }) => {
  await page.goto('/cliente/ayuda');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('.help-context')).toHaveCount(0);
});
