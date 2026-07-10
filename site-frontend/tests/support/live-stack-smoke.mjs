import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

const siteUrl = process.env.SITE_URL ?? "http://127.0.0.1:4321";
const browser = await chromium.launch({ channel: "chromium" });

try {
  const variants = [
    { name: "desktop", context: { viewport: { width: 1440, height: 900 } } },
    {
      name: "mobile",
      context: {
        viewport: { width: 393, height: 851 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ];

  for (const [index, variant] of variants.entries()) {
    const context = await browser.newContext(variant.context);
    const page = await context.newPage();
    const unique = `${Date.now()}${index}`;
    const email = `smoke+${unique}@example.com`;
    const curp = `ABCD123456HMNLRS${unique.slice(-2)}`;

    await page.goto(`${siteUrl}/registro`);
    await page.locator("#curp").fill(curp);
    await page.locator("#first_name").fill("Smoke");
    await page.locator("#last_name").fill(variant.name);
    await page.locator("#email").fill(email);
    await page.locator("#phone").fill("5551234567");
    await page.locator("#postal_code").fill("01010");
    await page.locator("#state").fill("CDMX");
    await page.locator("#city").fill("Ciudad de Mexico");
    await page.locator("#password").fill("correct-horse-7");
    await page.locator("#confirm_password").fill("correct-horse-7");
    await page.locator("#terms_accepted").check();
    await page.locator("#submit-button").click();
    await page.waitForURL(/\/login$/, { timeout: 10_000 });

    await page.locator("#email").fill(email);
    await page.locator("#password").fill("correct-horse-7");
    await page.locator("#submit-button").click();
    await page.waitForURL(/\/cliente$/, { timeout: 10_000 });

    const dashboard = await page.locator("body").innerText();
    assert.match(dashboard, /Hola, Smoke/);
    assert.match(dashboard, /Validación AFORE pendiente/);

    await page.locator("#client-shell-user-toggle").click();
    await page.locator("#logout").click();
    await page.waitForURL(/\/login$/, { timeout: 10_000 });
    await context.close();
  }
} finally {
  await browser.close();
}
