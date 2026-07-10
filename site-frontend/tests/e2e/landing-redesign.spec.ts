import { expect, test } from "@playwright/test";

test("landing keeps dual CTA hierarchy and compliant copy", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: /Comenzar ahora/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Cómo funciona/i })).toBeVisible();

  const trustSection = page.locator("#confianza");
  await expect(trustSection.getByRole("link", { name: /Comienza tu viaje/i })).toBeVisible();
  await expect(trustSection.getByRole("link", { name: /Iniciar sesión/i })).toBeVisible();

  await expect(page.getByText(/Cashback/i)).toHaveCount(0);
  await expect(page.getByText(/Auditado Premium/i)).toHaveCount(0);
  await expect(page.getByText(/Privacidad Absoluta/i)).toHaveCount(0);
});

test("footer exposes explicit legal and support paths", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Términos de uso" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Política de privacidad" })).toBeVisible();
  await expect(page.locator("footer a[href='mailto:soporte@carobra.mx']")).toBeVisible();
});
