import { expect, test, type Page } from "@playwright/test";

test("pending customer enters the real invited Rewards experience", async ({ page }) => {
  await login(page, "ada@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Invitado" })).toBeVisible();
  await expect(page.getByText("Saldo disponible")).toBeVisible();
  await expect(page.getByText("45 pts", { exact: true })).toBeVisible();
  await expect(page.getByText(/canje aún no está disponible/i)).toBeVisible();
  await expect(page.getByText("Aún no hay productos confirmados")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beneficios" })).toHaveCount(0);
});

test("eligible customer sees the production Rewards summary at exactly 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await login(page, "eligible@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Hola, Ada" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bronce" })).toBeVisible();
  await expect(page.getByText("Saldo disponible")).toBeVisible();
  await expect(page.getByText("150 pts").first()).toBeVisible();
  await expect(page.getByText("Primer producto validado")).toBeVisible();
  await expect(page.getByText("Bienvenida a Carobra Rewards")).toBeVisible();
  await expect(page.getByText("Plan personal de retiro")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tu espacio para redimir" })).toBeVisible();
  await expect(page.getByText("Catálogo en preparación")).toBeVisible();
  await expect(page.getByText("Recompensas destacadas")).toBeVisible();
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

test("inactive customer sees a protected inactive state without Rewards data", async ({ page }) => {
  await login(page, "inactive@example.com");

  await expect(page).toHaveURL(/\/cliente\/validacion$/);
  await expect(page.getByRole("heading", { name: "Cuenta inactiva" })).toBeVisible();
  await expect(page.getByText("Saldo disponible")).toHaveCount(0);
  await expect(page.getByText("2,000 pts")).toHaveCount(0);
});

test("attention-required customer receives a safe support state", async ({ page }) => {
  await login(page, "attention@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", {
    name: "En revisión",
  })).toBeVisible();
  await expect(page.getByText(/Nuestro equipo está revisando la validación/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Contactar soporte" })).toBeVisible();
  await expect(page.getByText("45 pts", { exact: true })).toBeVisible();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("correct-horse-7");
  await page.locator("#submit-button").click();
}
