import { expect, test, type Page } from "@playwright/test";

test("pending customer can navigate the complete provider-neutral portal safely", async ({ page }) => {
  await login(page, "ada@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Invitado" })).toBeVisible();
  await expect(page.getByText("45 pts", { exact: true })).toBeVisible();
  const mobileMenu = page.getByRole("button", { name: "Abrir menú de navegación" });
  const isMobile = await mobileMenu.isVisible();
  if (isMobile) {
    await expect(async () => {
      if ((await mobileMenu.getAttribute("aria-expanded")) !== "true") {
        await mobileMenu.click();
      }
      await expect(mobileMenu).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  }
  await expect(page.getByRole("link", { name: /Beneficios/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Ganar puntos/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Productos/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Actividad/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Gift Cards/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver notificaciones" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver notificaciones" })).not.toHaveAttribute("data-astro-prefetch", "hover");
  await expect(page.getByText("Avisos", { exact: true })).toHaveCount(0);
  const activeNavigation = page.getByRole("navigation", { name: isMobile ? /Navegación móvil/ : /Navegación cliente/ });
  await expect(activeNavigation.getByText("Inicio", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Servicios", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Estamos validando tu producto" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/SISCA|H24|H72|D3|D5/i);
  const rendered = await page.reload();
  expect(rendered?.headers()["server-timing"]).toMatch(/auth-context;dur=\d+\.\d, page-render;dur=\d+\.\d, total;dur=\d+\.\d/);

  await page.goto("/cliente/beneficios");
  await expect(page.getByRole("heading", { name: "Beneficios", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Todo en un solo lugar." })).toBeVisible();
  await expect(page.getByText("Producto pendiente")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Próximas experiencias" })).toBeVisible();
  await expect(page.getByRole("button", { name: /canjear|redimir/i })).toHaveCount(0);

  await page.goto("/cliente/cursos");
  await expect(page.getByRole("heading", { name: "Una biblioteca hecha para tu camino" })).toBeVisible();
  await expect(page.getByText("Aún no tienes cursos asignados")).toBeVisible();

  await page.goto("/cliente/gift-cards");
  await expect(page.getByRole("heading", { name: "Esta categoría aún no está habilitada" })).toBeVisible();
  await expect(page.getByText("Producto pendiente", { exact: true })).toBeVisible();
  await expect(page.getByText("No hay Gift Cards disponibles todavía")).toBeVisible();
  await expect(page.getByRole("link", { name: /Volver a Beneficios/ })).toBeVisible();
});

test("validated customer sees a complete portal and a truthful rewards catalog", async ({ page }) => {
  await login(page, "eligible@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Bronce" })).toBeVisible();
  await expect(page.getByText("150 pts").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Completa tu perfil financiero" }).first()).toBeVisible();
  await expect(page.getByText("Cuenta de retiro")).toHaveCount(0);
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
  await expect(page.getByText("Cuenta preparada", { exact: true })).toBeVisible();
  await expect(page.getByText("150 pts")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gift Cards" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Próximas experiencias" })).toBeVisible();

  await page.goto("/cliente/ganar-puntos");
  await expect(page.getByRole("heading", { name: "Ganar puntos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cada acción confirmada cuenta." })).toBeVisible();
  await expect(page.getByText("actividad registrada", { exact: true })).toBeVisible();

  await page.goto("/cliente/productos");
  await expect(page.getByRole("heading", { name: "Productos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cuenta de retiro" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Productos disponibles" })).toBeVisible();
  for (const product of ["Skandia", "Quálitas", "Modalidad 40"]) {
    const card = page.locator(".product-offer__card").filter({ hasText: product });
    await expect(card.getByRole("heading", { name: product })).toBeVisible();
    await expect(card.getByRole("link", { name: /Me interesa/ })).toHaveAttribute("href", /mailto:soporte@carobra\.mx\?subject=Quiero%20informaci/);
  }
  await expect(page.getByRole("button", { name: /contratar|solicitar/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Hablar con un asesor" })).toBeVisible();

  await page.goto("/cliente/activities");
  await expect(page.getByRole("heading", { name: "Actividad", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cambios en tu cuenta" })).toBeVisible();
  await expect(page.getByText("Primer producto validado")).toBeVisible();
  await expect(page.locator("#activities-list")).toHaveCount(0);

  await page.goto("/cliente/gift-cards");
  await expect(page.getByText("Producto confirmado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Categoría en preparación")).toBeVisible();
  await expect(page.getByRole("button", { name: /canjear|redimir/i })).toHaveCount(0);
});

test("portal navigation remains usable without horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await login(page, "eligible@example.com");

  await page.getByRole("button", { name: "Abrir menú de navegación" }).click();
  const mobileNav = page.getByRole("navigation", { name: /Navegación móvil/ });
  await expect(mobileNav.getByText("Inicio", { exact: true })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: /Beneficios/ })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: /Ganar puntos/ })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: /Productos/ })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: /Actividad/ })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: /Cursos|Gift Cards/ })).toHaveCount(0);
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
