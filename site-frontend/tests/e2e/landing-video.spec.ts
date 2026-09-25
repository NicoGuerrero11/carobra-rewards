import { expect, test, type Page } from "@playwright/test";

const videoId = "BZD93x4dmt4";
const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
const thumbnailPattern = `https://i.ytimg.com/vi/${videoId}/*`;
const playerPattern = "https://www.youtube-nocookie.com/embed/**";
const playName = "Reproducir video institucional de Carobra";
const posterFixture = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#004b87"/></svg>';

async function mockMedia(page: Page) {
  // Contract tests deliberately do not claim to verify YouTube playback.
  await page.route(thumbnailPattern, (route) => route.fulfill({ contentType: "image/svg+xml", body: posterFixture }));
  await page.route(playerPattern, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated embed fixture</title>" }));
}

test("approved cover appears without loading a player or its SDK", async ({ page }) => {
  const playerRequests: string[] = [];
  page.on("request", (request) => {
    if (/youtube(?:-nocookie)?\.com|googlevideo\.com/.test(request.url())) playerRequests.push(request.url());
  });
  await mockMedia(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: playName })).toBeVisible();
  const poster = page.locator("[data-video-poster]");
  await expect(poster).toHaveAttribute("src", `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`);
  await expect.poll(() => poster.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1280);
  await expect(page.locator("[data-institutional-video] iframe")).toHaveCount(0);
  await expect(page.locator('script[src*="youtube"]')).toHaveCount(0);
  expect(playerRequests).toEqual([]);
  await expect(page.locator("[data-institutional-video] figcaption")).toHaveCount(0);
  const button = await page.getByRole("button", { name: playName }).boundingBox();
  expect(button!.height).toBeGreaterThanOrEqual(44);
  expect(button!.width).toBeLessThan(190);
});

test("click opens one inline player with the approved URL and stable layout", async ({ page }) => {
  await mockMedia(page);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const frame = page.locator("[data-video-frame]");
  const before = await frame.boundingBox();
  await page.getByRole("button", { name: playName }).click();
  const player = frame.locator("iframe");
  await expect(player).toHaveCount(1);
  const url = new URL((await player.getAttribute("src"))!);
  expect(url.origin).toBe("https://www.youtube-nocookie.com");
  expect(url.pathname).toBe(`/embed/${videoId}`);
  expect(url.searchParams.get("autoplay")).toBe("1");
  expect(url.searchParams.get("playsinline")).toBe("1");
  await expect(player).toHaveAttribute("title", "Video institucional de Carobra");
  await expect(player).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  await expect(player).toHaveAttribute("allowfullscreen", "");
  await expect(player).toBeFocused();
  const after = await frame.boundingBox();
  expect(after!.width).toBeCloseTo(before!.width, 1);
  expect(after!.height).toBeCloseTo(before!.height, 1);
  await expect(page.getByRole("button", { name: playName })).toHaveCount(0);
});

test("visual polish crops only the cover and leaves the full player untouched", async ({ page }) => {
  await mockMedia(page);
  await page.goto("/");
  const frame = page.locator("[data-video-frame]");
  const poster = page.locator("[data-video-poster]");
  const previewScale = await poster.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a);
  expect(previewScale).toBeCloseTo(1.07, 2);
  expect(await frame.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe("none");
  await page.getByRole("button", { name: playName }).click();
  const player = frame.locator("iframe");
  expect(await player.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  const viewport = await frame.boundingBox();
  const playerBounds = await player.boundingBox();
  expect(playerBounds!.x).toBeCloseTo(viewport!.x, 1);
  expect(playerBounds!.y).toBeCloseTo(viewport!.y, 1);
  expect(playerBounds!.width).toBeCloseTo(viewport!.width, 1);
  expect(playerBounds!.height).toBeCloseTo(viewport!.height, 1);
});

for (const key of ["Enter", "Space"]) {
  test(`play control supports ${key} and visible keyboard focus`, async ({ page }) => {
    await mockMedia(page);
    await page.goto("/");
    const button = page.getByRole("button", { name: playName });
    await button.focus();
    await expect(button).toBeFocused();
    expect(await button.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
    await button.press(key);
    await expect(page.locator("[data-video-frame] iframe")).toHaveCount(1);
    await expect(page.locator("[data-video-frame] iframe")).toBeFocused();
  });
}

test("failed high-resolution cover uses the standard thumbnail", async ({ page }) => {
  await mockMedia(page);
  await page.route(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, (route) => route.abort());
  await page.goto("/");
  const poster = page.locator("[data-video-poster]");
  await expect(poster).toHaveAttribute("src", `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  await expect(poster).toBeVisible();
  await expect.poll(() => poster.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1280);
  await expect(page.getByRole("button", { name: playName })).toBeVisible();
});

test("missing covers retain an accessible branded play control without a broken image", async ({ page }) => {
  await mockMedia(page);
  await page.route(thumbnailPattern, (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("[data-video-poster]")).toBeHidden();
  await page.getByRole("button", { name: playName }).click();
  await expect(page.locator("[data-video-frame] iframe")).toBeVisible();
});

test("without JavaScript the preview links directly to the video", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await mockMedia(page);
  try {
    await page.goto(baseURL!);
    await expect(page.locator("noscript a")).toBeVisible();
    await expect(page.locator("noscript a")).toHaveAttribute("href", watchUrl);
    await expect(page.locator("[data-video-play]")).toBeHidden();
    await expect(page.locator("[data-video-frame] iframe")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("320px layout places the video after the copy with a stable 200px minimum player", async ({ page }) => {
  await mockMedia(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const copy = await page.locator(".landing-hero__copy").boundingBox();
  const frame = page.locator("[data-video-frame]");
  const before = await frame.boundingBox();
  expect(before!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height);
  expect(before!.height).toBeGreaterThanOrEqual(200);
  expect(before!.x).toBeGreaterThanOrEqual(0);
  expect(before!.x + before!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: playName }).click();
  const after = await frame.boundingBox();
  expect(after!.height).toBeCloseTo(before!.height, 1);
  const player = await frame.locator("iframe").boundingBox();
  expect(player!.height).toBeGreaterThanOrEqual(200);
  expect(player!.width).toBeCloseTo(before!.width, 1);
});
