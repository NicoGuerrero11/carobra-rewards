import { expect, test } from "@playwright/test";

test("landing keeps dual CTA hierarchy and compliant copy", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Tu relación con Carobra ahora te da más/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Quiero ser parte/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Descubre cómo funciona/i })).toBeVisible();
  await expect(page.locator("nav[aria-label='Navegación principal'] a[href='#productos']")).toHaveCount(1);
  await expect(page.locator("nav[aria-label='Navegación principal'] a[href='#quienes-somos']")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Conoce lo que puedes contratar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Experiencia financiera con acompañamiento personal" })).toBeVisible();
  await expect(page.getByText("14 años de experiencia", { exact: true })).toBeVisible();
  await expect(page.getByText("Más de 2,000 asesores", { exact: true })).toBeVisible();
  await expect(page.getByText("El video institucional se incorporará al recibir el archivo aprobado.")).toBeVisible();
  for (const product of ["Skandia", "Quálitas", "Modalidad 40", "Infinity"]) {
    await expect(page.getByRole("heading", { name: product })).toBeVisible();
  }

  const trustSection = page.locator("#confianza");
  await expect(trustSection.getByRole("link", { name: /Únete a Carobra Rewards/i })).toBeVisible();
  await expect(trustSection.getByRole("link", { name: /Iniciar sesión/i })).toBeVisible();

  await expect(page.getByText(/MVP/i)).toHaveCount(0);
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

test("browser chrome uses the Carobra brand icon", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("link[rel='icon']")).toHaveAttribute("href", "/favicon.png");
  await expect(page.locator("link[rel='apple-touch-icon']")).toHaveAttribute("href", "/apple-touch-icon.png");
});
