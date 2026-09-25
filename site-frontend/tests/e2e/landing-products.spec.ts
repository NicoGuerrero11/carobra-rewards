import { expect, test } from "@playwright/test";

const products = ["Skandia", "Quálitas", "Modalidad 40", "Infinity"];

test.beforeEach(async ({ page }) => {
  // Product/catalog presentation does not depend on the third-party video cover.
  await page.route("https://i.ytimg.com/**", (route) => route.abort());
});

test("compact product cards show existing logos, short copy and registration links", async ({ page }) => {
  await page.goto("/#productos");
  const section = page.getByRole("region", { name: "Conoce lo que puedes contratar" });
  await expect(section.locator(".public-offer")).toHaveCount(4);
  for (const product of products) {
    const card = section.getByRole("link", { name: `${product}: ir al registro para conocer esta solución` });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("href", "/registro");
    await expect(card.getByRole("heading", { name: product, exact: true })).toBeVisible();
    await expect(card.locator("p")).toHaveCount(1);
    expect((await card.locator("p").innerText()).length).toBeLessThan(65);
    expect((await card.boundingBox())!.height).toBeLessThan(250);
  }
  for (const product of ["Skandia", "Quálitas"]) {
    const logo = section.getByRole("img", { name: product, exact: true });
    await logo.scrollIntoViewIfNeeded();
    await expect.poll(() => logo.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    await expect(logo).toHaveAttribute("src", /^\/images\/products\//);
    expect(await logo.evaluate(node => getComputedStyle(node).objectFit)).toBe("contain");
  }
  await expect(section.locator(".public-offer--infinity img")).toHaveCount(0);
  await expect(section.locator("button, [data-products-track]")).toHaveCount(0);
  await expect(section.getByText("Quiero conocer esta solución", { exact: true })).toHaveCount(0);
});

test("product cards are keyboard accessible without nested controls", async ({ page }) => {
  await page.goto("/#productos");
  const cards = page.locator("#productos .public-offer");
  await cards.first().focus();
  for (let index = 0; index < products.length; index += 1) {
    const card = cards.nth(index);
    await expect(card).toBeFocused();
    expect(await card.evaluate(node => getComputedStyle(node).outlineStyle)).toBe("solid");
    await expect(card.locator("button, a")).toHaveCount(0);
    if (index < products.length - 1) await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/registro$/);
});

test("coupon preview remains independent from contracting products", async ({ page }) => {
  await page.goto("/#catalogo");
  const catalog = page.getByRole("region", { name: "Marcas consideradas para Rewards" });
  await expect(catalog).toBeVisible();
  await expect(catalog).toHaveAttribute("id", "catalogo");
  await expect(catalog.getByText("Catálogo próximamente")).toBeVisible();
  await expect(catalog.getByText(/después de la confirmación del proveedor/)).toBeVisible();
  await expect(catalog.getByText("Cinépolis", { exact: true })).toBeVisible();
  await expect(catalog.locator("a")).toHaveCount(0);
  await expect(page.locator("#productos #catalogo, #cursos")).toHaveCount(0);
  expect(await page.locator("#productos").evaluate(node => node.nextElementSibling?.id)).toBe("catalogo");
  await expect(page.locator('footer a[href="#catalogo"]')).toHaveText("Catálogo");
});

for (const [width, columns] of [[320, 1], [390, 2], [768, 2], [1280, 4]]) {
  test(`products fit ${width}px in ${columns} columns without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#productos");
    await page.evaluate(() => document.fonts.ready);
    const grid = page.locator(".public-products__grid");
    expect(await grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length)).toBe(columns);
    for (const card of await grid.locator(".public-offer").all()) {
      const bounds = await card.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
