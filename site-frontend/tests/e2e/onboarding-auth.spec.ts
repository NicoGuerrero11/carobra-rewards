import { expect, test, type Page } from "@playwright/test";

test("registers a customer and redirects to login", async ({ page }) => {
  await page.goto("/registro");
  await fillRegistration(page);

  await page.locator("#submit-button").click();

  await expect(page.locator("#feedback")).toContainText("Cuenta creada");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("#feedback")).toContainText("Tu cuenta fue creada");
});

test("captures an opaque referral link without showing the referrer", async ({ page }) => {
  await page.goto("/registro?ref=abcdefghijklmnopqrstuvwxyzABCDEFG_123456789");

  await expect(page.getByText("Llegaste mediante una invitación de Carobra Rewards")).toBeVisible();
  await expect(page.locator("[name='referral_token']")).toHaveValue(
    "abcdefghijklmnopqrstuvwxyzABCDEFG_123456789",
  );
  await expect(page.getByText(/Lovelace|eligible@example.com/)).toHaveCount(0);
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

test("logs in and renders Rewards as the invited customer home", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill("ada@example.com");
  await page.locator("#password").fill("correct-horse-7");

  await page.locator("#submit-button").click();

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Hola, Ada" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invitado" })).toBeVisible();
  await expect(page.getByText(/Rewards ID:/)).toHaveCount(0);
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
