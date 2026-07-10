import { expect, test, type Page } from "@playwright/test";

test("registers a customer and redirects to login", async ({ page }) => {
  await page.goto("/registro");
  await fillRegistration(page);

  await page.locator("#submit-button").click();

  await expect(page.locator("#feedback")).toContainText("Cuenta creada");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("#feedback")).toContainText("Tu cuenta fue creada");
});

test("renders a stable registration API error on the matching field", async ({ page }) => {
  await page.goto("/registro");
  await fillRegistration(page, "duplicate@example.com");

  await page.locator("#submit-button").click();

  await expect(page.locator("[data-error-for='email']")).toContainText(
    "Ya existe una cuenta registrada con este email",
  );
  await expect(page.locator("#feedback")).toContainText(
    "Ya existe una cuenta registrada con este email",
  );
});

test("renders invalid login without exposing credential details", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill("ada@example.com");
  await page.locator("#password").fill("wrong-password");

  await page.locator("#submit-button").click();

  await expect(page.locator("#feedback")).toContainText(
    "El email o la contraseña no son correctos",
  );
  await expect(page.locator("[data-error-for='password']")).toContainText(
    "El email o la contraseña no son correctos",
  );
});

test("logs in and renders the authenticated dashboard validation status", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill("ada@example.com");
  await page.locator("#password").fill("correct-horse-7");

  await page.locator("#submit-button").click();

  await expect(page).toHaveURL(/\/cliente$/);
  await expect(page.getByRole("heading", { name: "Hola, Ada" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Validación AFORE pendiente" })).toBeVisible();
  await expect(page.getByText("Rewards ID: RWD-e2e")).toBeVisible();
});

test("redirects an unauthenticated dashboard request to login", async ({ page }) => {
  await page.goto("/cliente");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
});

async function fillRegistration(page: Page, email = "ada@example.com") {
  await page.locator("#curp").fill("ABCD123456HMNLRS09");
  await page.locator("#first_name").fill("Ada");
  await page.locator("#last_name").fill("Lovelace");
  await page.locator("#email").fill(email);
  await page.locator("#phone").fill("5551234567");
  await page.locator("#postal_code").fill("01010");
  await page.locator("#state").fill("CDMX");
  await page.locator("#city").fill("Ciudad de Mexico");
  await page.locator("#password").fill("correct-horse-7");
  await page.locator("#confirm_password").fill("correct-horse-7");
  await page.locator("#terms_accepted").check();
}
