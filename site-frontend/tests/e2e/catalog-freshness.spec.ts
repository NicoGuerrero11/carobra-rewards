import { test, expect } from '@playwright/test';

test('last known catalog and detail remain explicitly stale until refreshed', async ({ page, context }) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addCookies([
    { name: 'carobra_session', value: 'e2e-eligible', domain: '127.0.0.1', path: '/' },
    { name: 'home-coupons', value: 'stale', domain: '127.0.0.1', path: '/' },
  ]);
  await page.goto('/cliente/beneficios');
  await expect(page.locator('.coupon-card')).toHaveCount(2);
  const warning = page.getByRole('status').filter({ hasText: 'No pudimos actualizar el catálogo' });
  await expect(warning).toBeVisible();
  await expect(warning.getByRole('link', { name: 'Volver a intentar' })).toHaveAttribute('href', '/cliente/beneficios');
  await page.goto('/cliente/beneficios/cinepolis');
  await expect(page.getByRole('status').filter({ hasText: 'Confirmaremos la disponibilidad antes de solicitar tu beneficio' })).toBeVisible();
  await context.addCookies([{ name: 'home-coupons', value: 'fresh', domain: '127.0.0.1', path: '/' }]);
  await page.reload();
  await expect(page.getByText('No pudimos actualizar esta información.')).toHaveCount(0);
  await page.goto('/cliente/beneficios');
  await expect(warning).toHaveCount(0);
  await expect(page.locator('.coupon-card')).toHaveCount(2);
});
