import { expect, test, type Page } from "@playwright/test";

test("registers a customer and redirects to login", async ({ page }) => {
  await page.goto("/registro");
  await fillRegistration(page);

  const sent = page.waitForRequest(request => request.url().endsWith("/api/v1/auth/register") && request.method() === "POST");
  await page.locator("#submit-button").click();
  expect((await sent).postDataJSON()).not.toHaveProperty("birth_date");

  await expect(page.locator("#feedback")).toContainText("Cuenta creada");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("#feedback")).toContainText("Tu cuenta fue creada");
});

test("landing registration offers an optional date input and sends the exact calendar date", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Únete a Rewards", exact: true }).first().click();
  await expect(page).toHaveURL(/\/registro$/);
  const input = page.getByLabel("Fecha de nacimiento", { exact: true });
  await expect(input).toHaveAttribute("type", "date");
  await expect(input).toHaveAttribute("autocomplete", "bday");
  await expect(input).toHaveAttribute("min", "1900-01-01");
  await expect(input).not.toHaveAttribute("required");
  await fillRegistration(page);
  await input.fill("1992-02-29");
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("registration-birth-date.png"), fullPage: true });
  const sent = page.waitForRequest(request => request.url().endsWith("/api/v1/auth/register") && request.method() === "POST");
  await page.locator("#submit-button").click();
  expect((await sent).postDataJSON().birth_date).toBe("1992-02-29");
  await expect(page.locator("#feedback")).toContainText("Cuenta creada");
});

test("birth date rejects future and out-of-range input without submitting", async ({ page }) => {
  await page.goto("/registro");
  await fillRegistration(page);
  let submissions = 0;
  page.on("request", request => {
    if (request.url().endsWith("/api/v1/auth/register") && request.method() === "POST") submissions++;
  });
  for (const date of ["2999-01-01", "1899-12-31"]) {
    await page.locator("#birth_date").fill(date);
    await page.locator("#submit-button").click();
    await expect(page.locator("#birth-date-error")).toContainText("fecha de nacimiento válida");
    await expect(page.locator("#birth_date")).toBeFocused();
    expect(submissions).toBe(0);
  }
});

test("server date error stays attached to the editable date field", async ({ page }) => {
  await page.goto("/registro");
  await fillRegistration(page);
  await page.locator("#birth_date").fill("1990-05-17");
  await page.route("**/api/v1/auth/register", route => route.fulfill({
    status: 422, contentType: "application/json", body: JSON.stringify({ error: { code: "invalid_birth_date" } }),
  }));
  await page.locator("#submit-button").click();
  await expect(page.locator("#birth-date-error")).toBeVisible();
  await expect(page.locator("#birth_date")).toBeFocused();
  await expect(page.locator("#birth_date")).toHaveValue("1990-05-17");
  await expect(page.locator("#submit-button")).toBeEnabled();
  await expect(page.locator("#feedback")).not.toContainText("servicio no está disponible");
});

test("registration date fits at 320px and uses Mexico City for the maximum date", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-28T02:00:00Z") });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/registro");
  await expect(page.locator("#birth_date")).toHaveAttribute("max", "2026-09-27");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
