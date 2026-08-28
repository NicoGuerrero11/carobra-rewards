import { expect, test, type Page } from "@playwright/test";

test("pending customer enters the real invited Rewards experience", async ({ page }) => {
  await login(page, "ada@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Invitado", exact: true })).toBeVisible();
  await expect(page.getByText("Saldo disponible")).toBeVisible();
  await expect(page.getByText("45 pts", { exact: true })).toBeVisible();
  await expect(page.getByText(/canje todavía no está habilitado/i)).toBeVisible();
  await expect(page.getByText("Primero: validar tu producto", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lo disponible hoy" })).toBeVisible();

  await assertCustomerSectionsAreReachable(page);
  await page.goto("/cliente/productos");
  await expect(page.getByText("Aún no hay productos confirmados")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Productos disponibles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Skandia" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quálitas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Modalidad 40" })).toBeVisible();
});

test("eligible customer sees the production Rewards summary at exactly 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await login(page, "eligible@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Hola, Ada" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bronce" })).toBeVisible();
  await expect(page.getByText("Saldo disponible")).toBeVisible();
  await expect(page.getByText("150 pts").first()).toBeVisible();
  await expect(page.getByText("Producto confirmado").first()).toBeVisible();
  await expect(page.getByText("Registro completado")).toBeVisible();
  await expect(page.getByText("Plan personal de retiro")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Lo disponible hoy" })).toBeVisible();
  await expect(page.getByText("Categoría en preparación")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Últimos movimientos de tu cuenta" })).toBeVisible();
  await expect(page.getByRole("button", { name: /canjear/i })).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("pending referral functionality is absent from the real Rewards summary", async ({ page }) => {
  await login(page, "eligible@example.com");
  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  const legacyResponse = await page.request.get("/cliente/recompensas/referidos", {
    maxRedirects: 0,
  });
  expect(legacyResponse.status()).toBe(302);
  expect(legacyResponse.headers().location).toBe("/cliente/recompensas");
  await page.goto("/cliente/recompensas");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Comparte tu link de referido" })).toHaveCount(0);
  await expect(page.getByLabel("Link personal de referidos")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Referidos" })).toHaveCount(0);
  await expect(page.getByText("Referido 1")).toHaveCount(0);
});

test("rejected customer remains invited and can browse every customer section", async ({ page }) => {
  await login(page, "inactive@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Invitado", exact: true })).toBeVisible();
  await expect(page.getByText("Miembro Invitado", { exact: true })).toBeVisible();
  await expect(page.getByText(/canje todavía no está habilitado/i)).toBeVisible();

  await assertCustomerSectionsAreReachable(page);
});

test("attention-required customer remains invited with a safe support state", async ({ page }) => {
  await login(page, "attention@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", {
    name: "Invitado",
    exact: true,
  })).toBeVisible();
  await expect(page.getByText("Miembro Invitado", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contactar soporte" })).toBeVisible();
  await expect(page.getByText("45 pts", { exact: true })).toBeVisible();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("correct-horse-7");
  await page.locator("#submit-button").click();
}

async function assertCustomerSectionsAreReachable(page: Page) {
  for (const path of [
    "/cliente/beneficios",
    "/cliente/ganar-puntos",
    "/cliente/productos",
    "/cliente/activities",
    "/cliente/gift-cards",
    "/cliente/cursos",
    "/cliente/notificaciones",
    "/cliente/perfil",
    "/cliente/validacion",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}$`));
  }
}
