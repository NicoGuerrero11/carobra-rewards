import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("customer rewards page and BFF expose only V2 rewards contracts", async () => {
  const page = await readFile(new URL("../../src/pages/cliente/recompensas.astro", import.meta.url), "utf8");
  const bff = await readFile(new URL("../../src/pages/api/v1/[...path].ts", import.meta.url), "utf8");

  assert.doesNotMatch(page, /\/api\/v1\/rewards\/(?:account|eligibility)/);
  assert.doesNotMatch(page, /legacyAccount|LegacyAccountSummary/);
  assert.match(page, /\/api\/v1\/rewards\/portal/);
  assert.doesNotMatch(page, /\/api\/v1\/rewards\/(?:journey|activities|movements)/);
  assert.equal((page.match(/\bfetch\(/g) ?? []).length, 1);
  assert.match(page, /portal\.journey/);
  assert.match(page, /portal\.activity_details/);
  assert.match(page, /portal\.movement_details/);
  assert.match(page, /unavailable && !journey/);

  assert.doesNotMatch(bff, /"rewards\/(?:account|eligibility)"/);
  assert.match(bff, /"rewards\/journey"/);
  assert.match(bff, /"rewards\/portal"/);
});

test("protected middleware overlaps authenticated context and exposes safe timing", async () => {
  const middleware = await readFile(new URL("../../src/middleware.ts", import.meta.url), "utf8");

  assert.match(middleware, /Promise\.all\(\[/);
  assert.match(middleware, /fetchSession\(cookieHeader\)/);
  assert.match(middleware, /isProtected \? fetchValidationStatus\(cookieHeader\)/);
  assert.match(middleware, /auth-context;dur=/);
  assert.match(middleware, /page-render;dur=/);
  assert.match(middleware, /total;dur=/);
  assert.doesNotMatch(middleware, /server-timing[^\n]*(?:customer|session|SISCA|sql)/i);
});
