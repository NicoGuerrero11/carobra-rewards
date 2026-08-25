import { expect, test, type Page } from "@playwright/test";

test("pending customer cannot see Rewards data on desktop or by direct URL", async ({ page }) => {
  await login(page, "ada@example.com");

  await expect(page).toHaveURL(/\/cliente\/validacion$/);
  await expect(page.getByRole("heading", { name: "Validación AFORE pendiente" })).toBeVisible();
  await expect(page.getByText("Saldo disponible")).toHaveCount(0);
  await expect(page.getByText("2,000 pts")).toHaveCount(0);

  await page.goto("/cliente/recompensas");
  await expect(page).toHaveURL(/\/cliente\/validacion$/);
  await expect(page.getByText("Saldo disponible")).toHaveCount(0);
});

test("eligible customer sees the initial 2,000-point account at exactly 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await login(page, "eligible@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Hola, Ada" })).toBeVisible();
  await expect(page.getByText("Saldo disponible")).toBeVisible();
  await expect(page.getByText("2,000 pts").first()).toBeVisible();
  await expect(page.getByText("Bienvenida a Carobra Rewards")).toBeVisible();
  await expect(page.getByText("Activo", { exact: true })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("eligible customer sees a reusable anonymous referral link and safe progress", async ({ page }) => {
  await login(page, "eligible@example.com");
  await page.goto("/cliente/recompensas/referidos");

  await expect(page.getByRole("heading", { name: "Invita y gana puntos" })).toBeVisible();
  await expect(page.getByLabel("Link personal de referidos")).toHaveValue(/\/registro\?ref=/);
  await expect(page.getByText("Referido 1")).toBeVisible();
  await expect(page.getByText("3,000 pts")).toBeVisible();
  await expect(page.getByText("eligible@example.com")).toHaveCount(0);
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

  await expect(page).toHaveURL(/\/cliente\/validacion$/);
  await expect(page.getByRole("heading", {
    name: "Tu validación requiere atención",
  })).toBeVisible();
  await expect(page.getByText(/Nuestro equipo necesita revisar tu caso/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Contactar soporte" })).toBeVisible();
  await expect(page.getByText("Saldo disponible")).toHaveCount(0);
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("correct-horse-7");
  await page.locator("#submit-button").click();
}
