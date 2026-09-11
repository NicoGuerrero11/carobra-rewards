import { expect, test, type Page } from "@playwright/test";

test("pending customer can navigate the complete provider-neutral portal safely", async ({ page }) => {
  await login(page, "ada@example.com");

  await expect(page).toHaveURL(/\/cliente\/recompensas$/);
  await expect(page.getByRole("heading", { name: "Invitado" })).toBeVisible();
  await expect(page.getByText("45 pts", { exact: true })).toBeVisible();
  const isMobile = await page.getByRole("navigation", { name: /Navegación móvil/ }).isVisible();
  await expect(page.getByRole("link", { name: /Beneficios/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Cursos/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Productos/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Actividad/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Gift Cards/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Ver notificaciones/ })).toBeVisible();
  const helpLink = page.getByRole("link", { name: "Ayuda", exact: true });
  const notificationsLink = page.getByRole("link", { name: /^Ver notificaciones/ });
  await expect(helpLink).toHaveAttribute("title", "Ayuda");
  await expect(notificationsLink).toHaveAttribute("title", "Notificaciones");
  await helpLink.hover();
  await expect.poll(() => helpLink.evaluate((element) => getComputedStyle(element, "::after").opacity)).toBe("1");
  await notificationsLink.hover();
  await expect.poll(() => notificationsLink.evaluate((element) => getComputedStyle(element, "::after").opacity)).toBe("1");
  await expect(page.getByRole("link", { name: /^Ver notificaciones/ })).not.toHaveAttribute("data-astro-prefetch", "hover");
  await expect(page.getByText("Avisos", { exact: true })).toHaveCount(0);
  const activeNavigation = page.getByRole("navigation", { name: isMobile ? /Navegación móvil/ : /Navegación cliente/ });
  await expect(activeNavigation.getByText("Inicio", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Servicios", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Contrata tu primer producto y activa tu camino Rewards" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/SISCA|H24|H72|D3|D5/i);
  const rendered = await page.reload();
  expect(rendered?.headers()["server-timing"]).toMatch(/auth-context;dur=\d+\.\d, page-render;dur=\d+\.\d, total;dur=\d+\.\d/);

  await page.goto("/cliente/beneficios");
  await expect(page.getByText("Tus descuentos comienzan en Bronce")).toBeVisible();
  await expect(page.getByText("Tu nivel abre nuevas experiencias.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /canjear|redimir/i })).toHaveCount(0);

  await page.goto("/cliente/cursos");
  await expect(page.getByRole("heading", { name: "Próximamente" })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Próximamente" })).toBeVisible();

  await page.goto("/cliente/notificaciones");
  await expect(page.getByRole("heading", { name: "Notificaciones" })).toBeVisible();

  await page.goto("/cliente/perfil");
  await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Elige qué actualizaciones recibir" })).toBeVisible();

  await page.goto("/cliente/beneficios");
  await expect(page.getByRole("heading", { name: "2 beneficios para ti" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cinépolis" })).toHaveCount(0);
  await expect(page.locator(".coupon-card__visual > img").first()).toHaveAttribute("src", /cuponstar-ar\.s3\.amazonaws\.com/);
  await expect(page.locator(".coupon-card__logo img")).toHaveAttribute("src", /cuponstar-ar\.s3\.amazonaws\.com/);
  await expect(page.locator(".coupon-card__discount").first()).toHaveText("2x1");
  await expect(page.locator(".coupon-card__visual")).toHaveCount(2);
  await expect(page.locator(".coupon-card__link").first()).toHaveAttribute("aria-label", /Cinépolis: 2x1/);
  await expect(page.getByText("Tu nivel abre nuevas experiencias.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Beneficios", exact: true })).toHaveCount(0);
  const hasCrowdedCardContent = await page.locator(".coupon-card").evaluateAll((cards) => cards.some((card) => {
    const visual = card.querySelector(".coupon-card__visual")?.getBoundingClientRect();
    const logo = card.querySelector(".coupon-card__logo")?.getBoundingClientRect();
    const discount = card.querySelector(".coupon-card__discount")?.getBoundingClientRect();
    if (!visual || !logo || !discount) return true;
    const logoOverlapsDiscount = logo.bottom > discount.top && logo.top < discount.bottom;
    const imageOfferGap = discount.top - visual.bottom;
    return logoOverlapsDiscount || imageOfferGap < 30;
  }));
  expect(hasCrowdedCardContent).toBe(false);
  await expect(page.getByRole("heading", { name: "Otras experiencias" })).toHaveCount(0);
  await expect(page.getByText(/Desde Bronce/)).toHaveCount(0);
  await page.getByRole("link", { name: "Ver beneficio" }).first().click();
  await expect(page).toHaveURL(/\/cliente\/beneficios\/cinepolis$/);
  await expect(page.getByRole("heading", { name: "Cinépolis", exact: true })).toBeVisible();
  await expect(page.locator(".coupon-detail__visual img")).toHaveAttribute("src", /variant=original/);
  const detailTitleSize = await page.locator("#coupon-title").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(detailTitleSize).toBeLessThanOrEqual(48);
  const detailDescriptionSize = await page.locator(".coupon-detail__copy .description").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(detailDescriptionSize).toBeLessThanOrEqual(15);
  await expect(page.getByRole("heading", { name: "Cómo usarlo" })).toBeVisible();
  await page.getByText("Sucursales disponibles").click();
  await expect(page.getByRole("dialog", { name: "Sucursales habilitadas" })).toBeVisible();
  await expect(page.getByText("Cinépolis Universidad")).toBeVisible();
  const branchDialog = page.getByRole("dialog", { name: "Sucursales habilitadas" });
  const dialogBox = await branchDialog.boundingBox();
  expect(dialogBox?.width).toBeLessThanOrEqual(752);
  expect(dialogBox?.height).toBeLessThanOrEqual(460);
  await expect(branchDialog.locator("#branches-map")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(branchDialog).toBeHidden();
  await page.getByRole("button", { name: "Quiero este beneficio" }).click();
  await expect(page.getByText(/no descuenta puntos/i)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar solicitud" }).click();
  await expect(page.getByText("CAROBRA-CINEPOLIS")).toBeVisible();

  await page.goto("/cliente/ganar-puntos");
  await expect(page).toHaveURL(/\/cliente\/cursos$/);
  await expect(page.getByRole("heading", { name: "Próximamente" })).toBeVisible();

  await page.goto("/cliente/productos");
  await expect(page.getByRole("heading", { name: "Productos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cuenta de retiro" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nuestras soluciones" })).toBeVisible();
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

  const mobileNav = page.getByRole("navigation", { name: /Navegación móvil/ });
  await expect(mobileNav.getByText("Inicio", { exact: true })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: /Beneficios/ })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: /Cursos/ })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: /Productos/ })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: /Actividad/ })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: /Ganar puntos|Gift Cards/ })).toHaveCount(0);
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
