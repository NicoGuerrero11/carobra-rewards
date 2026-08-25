import { expect, test, type Page } from "@playwright/test";

test("pending customer can navigate the complete provider-neutral portal safely", async ({ page }) => {
  await login(page, "ada@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Invitado" })).toBeVisible();
  await expect(page.getByText("45 pts", { exact: true })).toBeVisible();
  const mobileMenu = page.getByRole("button", { name: "Abrir menú de navegación" });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await expect(page.getByRole("link", { name: "Recompensas", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Cursos/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Gift Cards/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Inicio", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Servicios", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Estamos validando tu producto" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/SISCA|H24|H72|D3|D5/i);

  await page.goto("/cliente/beneficios");
  await expect(page.getByRole("heading", { name: "Recompensas", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tus puntos merecen algo especial." })).toBeVisible();
  await expect(page.getByText("Producto pendiente")).toBeVisible();
  await expect(page.getByText("Todavía no hay recompensas publicadas")).toBeVisible();
  await expect(page.getByRole("button", { name: /canjear|redimir/i })).toHaveCount(0);

  await page.goto("/cliente/cursos");
  await expect(page.getByRole("heading", { name: "Una biblioteca hecha para tu camino" })).toBeVisible();
  await expect(page.getByText("Aún no tienes cursos asignados")).toBeVisible();

  await page.goto("/cliente/gift-cards");
  await expect(page.getByRole("heading", { name: "Aquí estará tu sección de Gift Cards" })).toBeVisible();
  await expect(page.getByText("Pendiente de validar producto")).toBeVisible();
  await expect(page.getByText("No hay Gift Cards publicadas todavía")).toBeVisible();
});

test("validated customer sees a complete portal and a truthful rewards catalog", async ({ page }) => {
  await login(page, "eligible@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Bronce" })).toBeVisible();
  await expect(page.getByText("150 pts").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Completa tu perfil financiero" }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/SISCA|H24|H72|D3|D5/i);

  await page.goto("/cliente/cursos");
  await expect(page.getByRole("heading", { name: "Fundamentos para tu retiro" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "40");

  await page.goto("/cliente/notificaciones");
  await expect(page.getByRole("heading", { name: "Notificaciones" })).toBeVisible();

  await page.goto("/cliente/perfil");
  await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Elige qué actualizaciones recibir" })).toBeVisible();

  await page.goto("/cliente/beneficios");
  await expect(page.getByText("Cuenta preparada")).toBeVisible();
  await expect(page.getByText("150 pts")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gift Cards" })).toBeVisible();
  await expect(page.getByText("Todavía no hay recompensas publicadas")).toBeVisible();

  await page.goto("/cliente/gift-cards");
  await expect(page.getByText("Producto validado", { exact: true })).toBeVisible();
  await expect(page.getByText("Catálogo en preparación")).toBeVisible();
  await expect(page.getByRole("button", { name: /canjear|redimir/i })).toHaveCount(0);
});

test("portal navigation remains usable without horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await login(page, "eligible@example.com");

  await page.getByRole("button", { name: "Abrir menú de navegación" }).click();
  await expect(page.getByRole("navigation", { name: /Navegación móvil/ }).getByRole("link", { name: "Recompensas" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Navegación móvil/ }).getByRole("link", { name: "Cursos" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Navegación móvil/ }).getByRole("link", { name: "Gift Cards" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Navegación móvil/ }).getByRole("link", { name: "Servicios" })).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("correct-horse-7");
  await page.locator("#submit-button").click();
}
