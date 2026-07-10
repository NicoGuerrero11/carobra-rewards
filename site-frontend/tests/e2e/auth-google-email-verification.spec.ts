import { expect, test } from "@playwright/test";

test("login page does not offer Google sign-in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Continuar con Google", { exact: true })).toHaveCount(0);
});

test("register page does not offer Google sign-up", async ({ page }) => {
  await page.goto("/registro");
  await expect(page.getByText("Registrarme con Google", { exact: true })).toHaveCount(0);
});

test("demo email verification route is disabled", async ({ page }) => {
  await page.goto("/verificar-email");
  await expect(page).toHaveURL(/\/login$/);
});
